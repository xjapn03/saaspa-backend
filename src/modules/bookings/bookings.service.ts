import { Injectable, BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { IBookingsRepository } from '../../repositories/interfaces/bookings.repository';
import { IServicesRepository } from '../../repositories/interfaces/services.repository';
import { IPaymentsRepository } from '../../repositories/interfaces/payments.repository';
import { RedisService } from '../../common/redis/redis.service';
import { GoogleCalendarService } from '../../common/google-calendar/google-calendar.service';
import { BookingSyncService } from './booking-sync.service';
import { CreateBookingDto } from './dto/create-booking.dto';

const SLOT_INTERVAL = 30;
const LOCK_TTL = 10 * 60;
const BUSINESS_HOURS = { start: 8, end: 18 };

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private bookingsRepo: IBookingsRepository,
    private servicesRepo: IServicesRepository,
    private paymentsRepo: IPaymentsRepository,
    private redis: RedisService,
    private calendar: GoogleCalendarService,
    private bookingSync: BookingSyncService,
  ) {}

  async findAll(filters: { userId?: string; date?: string; status?: string }) {
    return this.bookingsRepo.findAll(filters);
  }

  async findById(id: string) {
    return this.bookingsRepo.findById(id);
  }

  async getAvailability(serviceId: string, date: string): Promise<string[]> {
    const service = await this.servicesRepo.findById(serviceId);
    const duration = service.duration;

    const occupied = await this.bookingsRepo.findOccupied(date);

    const lockedKeys = await this.redis.keys(`slot:${date}:*`);
    const lockedSlots: { startTime: Date; endTime: Date }[] = [];
    for (const key of lockedKeys) {
      const raw = await this.redis.get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        lockedSlots.push({
          startTime: new Date(parsed.start),
          endTime: new Date(parsed.end),
        });
      }
    }

    const allOccupied = [...occupied, ...lockedSlots];

    const slots: string[] = [];
    const [yyyy, mm, dd] = date.split('-').map(Number);
    const day = new Date(yyyy, mm - 1, dd, 0, 0, 0);
    const slotStart = new Date(day);
    slotStart.setHours(BUSINESS_HOURS.start, 0, 0, 0);
    const slotEnd = new Date(day);
    slotEnd.setHours(BUSINESS_HOURS.end, 0, 0, 0);

    let current = new Date(slotStart);
    while (current.getTime() + duration * 60000 <= slotEnd.getTime()) {
      const proposedEnd = new Date(current.getTime() + duration * 60000);

      const conflicts = allOccupied.some((o) => {
        const oStart = new Date(o.startTime).getTime();
        const oEnd = new Date(o.endTime).getTime();
        return current.getTime() < oEnd && proposedEnd.getTime() > oStart;
      });

      if (!conflicts) {
        slots.push(current.toISOString());
      }

      current = new Date(current.getTime() + SLOT_INTERVAL * 60000);
    }

    return slots;
  }

  async create(userId: string, dto: CreateBookingDto) {
    const service = await this.servicesRepo.findById(dto.serviceId);
    const startTime = new Date(dto.startTime);
    const endTime = new Date(startTime.getTime() + service.duration * 60000);

    const overlap = await this.bookingsRepo.findOverlapping(startTime, endTime);
    if (overlap) throw new ConflictException('El horario se cruza con otra cita reservada');

    const dateKey = startTime.toISOString().split('T')[0];
    const lockKey = `slot:${dateKey}:${startTime.toISOString()}`;

    const lockValue = JSON.stringify({ start: startTime.toISOString(), end: endTime.toISOString() });
    await this.redis.setex(lockKey, LOCK_TTL, lockValue);

    const booking = await this.bookingsRepo.create({
      user: { connect: { id: userId } },
      service: { connect: { id: dto.serviceId } },
      startTime,
      endTime,
    });

    return booking;
  }

  async confirm(id: string) {
    return this.bookingSync.confirmAndSync(id);
  }

  async syncPendingCalendar() {
    return this.bookingSync.syncPending();
  }

  async cancel(id: string, userId: string, isAdmin: boolean) {
    const booking = await this.bookingsRepo.findById(id);
    if (!isAdmin && booking.userId !== userId) {
      throw new ForbiddenException('Solo el dueño o un admin puede cancelar');
    }
    if (booking.status === 'COMPLETADA' || booking.status === 'CANCELADA') {
      throw new BadRequestException('No se puede cancelar una cita ya finalizada');
    }

    if (booking.googleEventId) {
      await this.calendar.deleteEvent(booking.googleEventId);
    }

    const dateKey = new Date(booking.startTime).toISOString().split('T')[0];
    const lockKey = `slot:${dateKey}:${new Date(booking.startTime).toISOString()}`;
    try { await this.redis.del(lockKey); } catch {}

    return this.bookingsRepo.update(id, { status: 'CANCELADA' } as any);
  }

  async complete(id: string) {
    const booking = await this.bookingsRepo.findById(id);
    if (booking.status !== 'CONFIRMADA') {
      throw new BadRequestException('Solo citas confirmadas pueden completarse');
    }

    const servicePrice = Number((booking.service as any)?.price || 0);
    const approved = await this.paymentsRepo.findApprovedByBookingId(id);
    const totalPaid = approved.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.round((servicePrice - totalPaid) * 100) / 100;

    if (remaining > 0) {
      throw new BadRequestException(
        `La cita tiene un saldo pendiente de $${remaining.toLocaleString('es-CO')}. Registra el pago antes de completarla.`,
      );
    }

    return this.bookingsRepo.update(id, { status: 'COMPLETADA' });
  }

  async reopen(id: string) {
    const booking = await this.bookingsRepo.findById(id);
    if (booking.status !== 'COMPLETADA' && booking.status !== 'NO_ASISTIO') {
      throw new BadRequestException('Solo citas completadas o no asistidas pueden revertirse');
    }
    return this.bookingsRepo.update(id, { status: 'CONFIRMADA' } as any);
  }

  async reschedule(id: string, newStartTime: string, userId: string, isAdmin: boolean) {
    const oldBooking = await this.bookingsRepo.findById(id);
    if (!isAdmin && oldBooking.userId !== userId) {
      throw new ForbiddenException('Solo el dueño o un admin puede reagendar');
    }
    if (oldBooking.status === 'COMPLETADA' || oldBooking.status === 'CANCELADA') {
      throw new BadRequestException('No se puede reagendar una cita ya finalizada');
    }

    const service = await this.servicesRepo.findById(oldBooking.serviceId);
    const startTime = new Date(newStartTime);
    const endTime = new Date(startTime.getTime() + service.duration * 60000);

    const overlap = await this.bookingsRepo.findOverlapping(startTime, endTime);
    if (overlap && overlap.id !== id) {
      throw new ConflictException('El nuevo horario se cruza con otra cita reservada');
    }

    const googleEventId = oldBooking.googleEventId;

    if (googleEventId) {
      await this.calendar.updateEvent(googleEventId, {
        startTime,
        endTime,
        user: oldBooking.user as any,
        service: oldBooking.service as any,
      });
    } else if (oldBooking.status === 'CONFIRMADA') {
      const createdId = await this.calendar.createEvent({
        id: oldBooking.id,
        startTime,
        endTime,
        status: oldBooking.status,
        user: oldBooking.user as any,
        service: oldBooking.service as any,
      });
      if (createdId) {
        await this.bookingsRepo.update(id, { googleEventId: createdId, calendarSync: 'SYNCED' } as any);
      }
    }

    const oldDateKey = new Date(oldBooking.startTime).toISOString().split('T')[0];
    const oldLockKey = `slot:${oldDateKey}:${new Date(oldBooking.startTime).toISOString()}`;
    try { await this.redis.del(oldLockKey); } catch {}

    const dateKey = startTime.toISOString().split('T')[0];
    const lockKey = `slot:${dateKey}:${startTime.toISOString()}`;
    const lockValue = JSON.stringify({ start: startTime.toISOString(), end: endTime.toISOString() });
    try { await this.redis.setex(lockKey, LOCK_TTL, lockValue); } catch {}

    return this.bookingsRepo.update(id, { startTime, endTime } as any);
  }
}
