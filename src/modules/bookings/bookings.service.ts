import { Injectable, BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { IBookingsRepository } from '../../repositories/interfaces/bookings.repository';
import { IServicesRepository } from '../../repositories/interfaces/services.repository';
import { RedisService } from '../../common/redis/redis.service';
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
    private redis: RedisService,
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

    const occupied = await this.bookingsRepo.findOccupied(serviceId, date);

    const lockedKeys = await this.redis.keys(`slot:${serviceId}:${date}:*`);
    const lockedSlots: { start: Date; end: Date }[] = [];
    for (const key of lockedKeys) {
      const raw = await this.redis.get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        lockedSlots.push({ start: new Date(parsed.start), end: new Date(parsed.end) });
      }
    }

    const allOccupied = [...occupied, ...lockedSlots];

    const slots: string[] = [];
    const day = new Date(date);
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

    const existing = await this.bookingsRepo.findBySlot(dto.serviceId, startTime, endTime);
    if (existing) throw new ConflictException('El horario ya está reservado');

    const dateKey = startTime.toISOString().split('T')[0];
    const lockKey = `slot:${dto.serviceId}:${dateKey}:${startTime.toISOString()}`;

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
    const booking = await this.bookingsRepo.findById(id);
    if (booking.status !== 'PENDIENTE_PAGO') {
      throw new BadRequestException('Solo citas pendientes pueden confirmarse');
    }
    const dateKey = new Date(booking.startTime).toISOString().split('T')[0];
    const lockKey = `slot:${booking.serviceId}:${dateKey}:${new Date(booking.startTime).toISOString()}`;
    try { await this.redis.del(lockKey); } catch {}

    return this.bookingsRepo.update(id, { status: 'CONFIRMADA' });
  }

  async cancel(id: string, userId: string, isAdmin: boolean) {
    const booking = await this.bookingsRepo.findById(id);
    if (!isAdmin && booking.userId !== userId) {
      throw new ForbiddenException('Solo el dueño o un admin puede cancelar');
    }
    if (booking.status === 'COMPLETADA' || booking.status === 'CANCELADA') {
      throw new BadRequestException('No se puede cancelar una cita ya finalizada');
    }

    const dateKey = new Date(booking.startTime).toISOString().split('T')[0];
    const lockKey = `slot:${booking.serviceId}:${dateKey}:${new Date(booking.startTime).toISOString()}`;
    try { await this.redis.del(lockKey); } catch {}

    return this.bookingsRepo.update(id, { status: 'CANCELADA' });
  }

  async complete(id: string) {
    const booking = await this.bookingsRepo.findById(id);
    if (booking.status !== 'CONFIRMADA') {
      throw new BadRequestException('Solo citas confirmadas pueden completarse');
    }
    return this.bookingsRepo.update(id, { status: 'COMPLETADA' });
  }
}
