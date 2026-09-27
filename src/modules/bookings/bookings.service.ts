import { Injectable, BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IBookingsRepository } from '../../repositories/interfaces/bookings.repository';
import { IServicesRepository } from '../../repositories/interfaces/services.repository';
import { IPaymentsRepository } from '../../repositories/interfaces/payments.repository';
import { RedisService } from '../../common/redis/redis.service';
import { GoogleCalendarService } from '../../common/google-calendar/google-calendar.service';
import { BookingSyncService } from './booking-sync.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import {
  DEFAULT_MAX_PENDING_PER_USER,
  DEFAULT_PAYMENT_TTL_MINUTES,
} from './booking.constants';

const SLOT_INTERVAL = 30;
const LOCK_TTL = 10 * 60;
const BUSINESS_HOURS = { start: 8, end: 18 };

/**
 * Shape accepted for the `Idempotency-Key` header (ADR 0008/0012). The key is
 * built by the caller and only travels: the backend honours it, it never derives
 * it from model output.
 */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:@-]{1,200}$/;

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
    private configService: ConfigService,
  ) {}

  /** Minutes a booking may stay PENDIENTE_PAGO before it releases its slot. */
  private get paymentTtlMinutes(): number {
    const configured = Number(this.configService.get('BOOKING_PAYMENT_TTL_MINUTES'));
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_PAYMENT_TTL_MINUTES;
  }

  /** Pending bookings a user may hold at the same time. */
  private get maxPendingPerUser(): number {
    const configured = Number(this.configService.get('BOOKING_MAX_PENDING_PER_USER'));
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_MAX_PENDING_PER_USER;
  }

  /**
   * Instants older than this no longer count as a pending payment. A booking
   * created before the deadline has stopped holding its slot.
   */
  private pendingPaymentDeadline(now: Date = new Date()): Date {
    return new Date(now.getTime() - this.paymentTtlMinutes * 60000);
  }

  async findAll(filters: { userId?: string; date?: string; status?: string }) {
    return this.bookingsRepo.findAll(filters);
  }

  async findById(id: string) {
    return this.bookingsRepo.findById(id);
  }

  async getAvailability(serviceId: string, date: string): Promise<string[]> {
    const window = await this.getAvailabilityWindow(serviceId, date);
    return window.slots.map((slot) => slot.start.toISOString());
  }

  /**
   * Same computation as getAvailability, but each slot also carries its end, so
   * the internal API can return instants with an explicit UTC offset.
   */
  async getAvailabilityWindow(
    serviceId: string,
    date: string,
  ): Promise<{ serviceId: string; date: string; slots: { start: Date; end: Date }[] }> {
    const service = await this.servicesRepo.findById(serviceId);
    const duration = service.duration;

    const occupied = await this.bookingsRepo.findOccupied(date, this.pendingPaymentDeadline());

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

    const slots: { start: Date; end: Date }[] = [];
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
        slots.push({ start: new Date(current), end: proposedEnd });
      }

      current = new Date(current.getTime() + SLOT_INTERVAL * 60000);
    }

    return { serviceId: service.id, date, slots };
  }

  async create(
    userId: string,
    dto: CreateBookingDto,
    options: { enforcePendingCap?: boolean; idempotencyKey?: string } = {},
  ) {
    const idempotencyKey = this.normalizeIdempotencyKey(options.idempotencyKey);
    // A retry of a request that already created a booking returns that same
    // booking, and it is resolved before the cap and the slot are evaluated:
    // otherwise the retry would be rejected by the state the first call created
    // (ADR 0008 / ADR 0012 point 4).
    if (idempotencyKey) {
      const existing = await this.bookingsRepo.findByIdempotencyKey(idempotencyKey);
      if (existing) return this.assertReplayBelongsToUser(existing, userId);
    }

    const service = await this.servicesRepo.findById(dto.serviceId);
    const startTime = new Date(dto.startTime);
    const endTime = new Date(startTime.getTime() + service.duration * 60000);
    const deadline = this.pendingPaymentDeadline();

    // A single conversation must not block several slots before paying any of
    // them (joint triage, B-01). The admin path is exempt: the salon staff
    // creates those bookings on purpose.
    if (options.enforcePendingCap !== false) {
      const pending = await this.bookingsRepo.countPendingByUser(userId, deadline);
      if (pending >= this.maxPendingPerUser) {
        throw new ConflictException(
          `Alcanzaste el límite de ${this.maxPendingPerUser} reservas pendientes de pago. ` +
            'Completa el pago o espera a que la franja se libere.',
        );
      }
    }

    const overlap = await this.bookingsRepo.findOverlapping(startTime, endTime, deadline);
    if (overlap) throw new ConflictException('El horario se cruza con otra cita reservada');

    const data = {
      user: { connect: { id: userId } },
      service: { connect: { id: dto.serviceId } },
      startTime,
      endTime,
    };

    const dateKey = startTime.toISOString().split('T')[0];
    const lockKey = `slot:${dateKey}:${startTime.toISOString()}`;

    const lockValue = JSON.stringify({ start: startTime.toISOString(), end: endTime.toISOString() });
    await this.redis.setex(lockKey, LOCK_TTL, lockValue);

    if (idempotencyKey) {
      const { booking, replayed } = await this.bookingsRepo.createWithIdempotencyKey(
        data,
        idempotencyKey,
      );
      return replayed ? this.assertReplayBelongsToUser(booking as never, userId) : booking;
    }

    return this.bookingsRepo.create(data);
  }

  /**
   * Validates the `Idempotency-Key` header. Absent means "no idempotency", which
   * is the case for the channels that do not send it.
   */
  private normalizeIdempotencyKey(raw?: string): string | undefined {
    if (raw === undefined || raw === '') return undefined;
    if (!IDEMPOTENCY_KEY_PATTERN.test(raw)) {
      throw new BadRequestException(
        'Idempotency-Key inválida: máximo 200 caracteres de [A-Za-z0-9._:@-]',
      );
    }
    return raw;
  }

  /**
   * A key that is already taken identifies the resource created by the first
   * call. If that resource belongs to somebody else the key was reused across
   * users: fail closed instead of leaking the booking.
   */
  private assertReplayBelongsToUser<T extends { userId: string }>(booking: T, userId: string): T {
    if (booking.userId !== userId) {
      throw new ConflictException('Idempotency-Key ya utilizada por otra operación');
    }
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

    this.releaseSlotLock(booking.startTime);

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
    if (['COMPLETADA', 'CANCELADA', 'EXPIRADA'].includes(oldBooking.status)) {
      throw new BadRequestException(
        'No se puede reagendar una cita finalizada o expirada por falta de pago',
      );
    }

    const service = await this.servicesRepo.findById(oldBooking.serviceId);
    const startTime = new Date(newStartTime);
    const endTime = new Date(startTime.getTime() + service.duration * 60000);

    const overlap = await this.bookingsRepo.findOverlapping(
      startTime,
      endTime,
      this.pendingPaymentDeadline(),
    );
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

    this.releaseSlotLock(oldBooking.startTime);

    const dateKey = startTime.toISOString().split('T')[0];
    const lockKey = `slot:${dateKey}:${startTime.toISOString()}`;
    const lockValue = JSON.stringify({ start: startTime.toISOString(), end: endTime.toISOString() });
    try { await this.redis.setex(lockKey, LOCK_TTL, lockValue); } catch {}

    return this.bookingsRepo.update(id, { startTime, endTime } as any);
  }

  /**
   * Moves every PENDIENTE_PAGO booking that outlived the payment window to
   * EXPIRADA, releasing the slot it was holding (joint triage, B-01). Idempotent
   * and safe to run from more than one instance: the status change is
   * conditional on the booking still being PENDIENTE_PAGO, so a payment that
   * arrives mid sweep wins.
   */
  async expireOverduePendingBookings(now: Date = new Date()): Promise<{ expired: number }> {
    const overdue = await this.bookingsRepo.findOverduePending(this.pendingPaymentDeadline(now));
    let expired = 0;

    for (const booking of overdue) {
      const moved = await this.bookingsRepo.markExpired(booking.id);
      if (!moved) continue; // a payment confirmed it between the query and the update

      if (booking.googleEventId) {
        await this.calendar
          .deleteEvent(booking.googleEventId)
          .catch(() =>
            this.logger.warn(`No se pudo borrar el evento de la cita expirada ${booking.id}`),
          );
      }

      this.releaseSlotLock(booking.startTime);
      expired++;
    }

    if (expired > 0) {
      this.logger.log(`Citas expiradas por falta de pago: ${expired}`);
    }

    return { expired };
  }

  /** Drops the Redis hold on a slot; the key TTL would remove it anyway. */
  private releaseSlotLock(startTime: Date): void {
    const dateKey = new Date(startTime).toISOString().split('T')[0];
    const lockKey = `slot:${dateKey}:${new Date(startTime).toISOString()}`;
    this.redis.del(lockKey).catch(() => {});
  }
}
