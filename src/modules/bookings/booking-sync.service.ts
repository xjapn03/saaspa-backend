import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IBookingsRepository, IBookingSafe } from '../../repositories/interfaces/bookings.repository';
import { GoogleCalendarService } from '../../common/google-calendar/google-calendar.service';
import { MetaCapiService, hashCapiValue, hashCapiPhone } from '../../modules/meta/meta-capi.service';
import { RedisService } from '../../common/redis/redis.service';
import { pendingPaymentDeadline } from './booking.constants';

/**
 * What a payment has to do with its booking (H-01): confirm it, park it so a
 * person assigns a slot (the window closed but the money arrived and the slot is
 * free) or leave it for manual review (the freed slot was taken by somebody
 * else, so the payment must be re-slotted or refunded).
 */
export type PaymentConfirmationOutcome = 'CONFIRMED' | 'NEEDS_SLOT' | 'NEEDS_REVIEW';

/** Statuses a payment webhook cannot confirm: only a person resolves them. */
const UNCONFIRMABLE_STATUSES = ['CANCELADA', 'COMPLETADA', 'NO_ASISTIO'];

@Injectable()
export class BookingSyncService {
  private readonly logger = new Logger(BookingSyncService.name);

  constructor(
    private bookingsRepo: IBookingsRepository,
    private calendar: GoogleCalendarService,
    private metaCapi: MetaCapiService,
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  async confirmAndSync(id: string, attribution?: { fbc?: string; fbp?: string }): Promise<IBookingSafe> {
    const booking = await this.bookingsRepo.findById(id);

    if (['CANCELADA', 'EXPIRADA', 'COMPLETADA', 'NO_ASISTIO'].includes(booking.status)) {
      throw new BadRequestException(
        'No se puede confirmar una cita cancelada, expirada por falta de pago, completada o no asistida',
      );
    }

    return this.applyConfirmation(booking, attribution);
  }

  /**
   * Confirmation triggered by a payment (H-01). Unlike `confirmAndSync`, which a
   * person calls from the dashboard and may fail loudly, this one must never fail
   * for a business reason: the money was already taken. It re-verifies the
   * payment window and the overlap of the slot and returns an explicit outcome
   * for the caller to record, instead of throwing.
   */
  async confirmOnPayment(
    id: string,
    attribution?: { fbc?: string; fbp?: string },
  ): Promise<{ outcome: PaymentConfirmationOutcome; booking: IBookingSafe }> {
    const booking = await this.bookingsRepo.findById(id);

    if (booking.status === 'CONFIRMADA') {
      // A retried webhook: the booking is already where it belongs.
      return { outcome: 'CONFIRMED', booking };
    }

    if (UNCONFIRMABLE_STATUSES.includes(booking.status)) {
      // Money on a booking nobody can confirm (cancelled, completed, no-show):
      // the webhook must not fail, it leaves it for manual review instead.
      return { outcome: 'NEEDS_REVIEW', booking };
    }

    const now = new Date();
    const deadline = pendingPaymentDeadline(this.config, now);
    const withinWindow =
      booking.status === 'PENDIENTE_PAGO' &&
      new Date(booking.createdAt).getTime() >= deadline.getTime();

    // The booking is excluded because, while it still holds the slot, it is its
    // own overlap. Whatever is left is somebody else holding the slot.
    const overlap = await this.bookingsRepo.findOverlapping(
      new Date(booking.startTime),
      new Date(booking.endTime),
      deadline,
      booking.id,
    );

    if (overlap) {
      await this.parkWithoutSlot(booking);
      return { outcome: 'NEEDS_REVIEW', booking: await this.bookingsRepo.findById(id) };
    }

    if (withinWindow) {
      return { outcome: 'CONFIRMED', booking: await this.applyConfirmation(booking, attribution) };
    }

    await this.parkWithoutSlot(booking);
    return { outcome: 'NEEDS_SLOT', booking: await this.bookingsRepo.findById(id) };
  }

  async syncPending(): Promise<{ synced: number; failed: number }> {
    const pending = await this.bookingsRepo.findPendingCalendarSync();
    let synced = 0;
    let failed = 0;

    for (const booking of pending) {
      const googleEventId = await this.calendar.createEvent({
        id: booking.id,
        startTime: new Date(booking.startTime),
        endTime: new Date(booking.endTime),
        status: booking.status,
        user: booking.user as any,
        service: booking.service as any,
      });

      if (googleEventId) {
        await this.bookingsRepo.update(booking.id, { googleEventId, calendarSync: 'SYNCED' } as any);
        synced++;
      } else {
        await this.bookingsRepo.update(booking.id, { calendarSync: 'FAILED' } as any);
        failed++;
      }
    }

    this.logger.log(`Sync de calendario: ${synced} sincronizadas, ${failed} fallidas`);
    return { synced, failed };
  }

  /**
   * Confirms a booking whose slot is free and applies the shared side effects
   * (status, Google Calendar, Meta CAPI). Used by the person-driven path and the
   * payment-driven one so both see exactly the same result.
   */
  private async applyConfirmation(
    booking: IBookingSafe,
    attribution?: { fbc?: string; fbp?: string },
  ): Promise<IBookingSafe> {
    this.releaseSlotLock(booking.startTime);

    if (booking.status !== 'CONFIRMADA') {
      await this.bookingsRepo.update(booking.id, { status: 'CONFIRMADA' } as any);
    }

    if (!booking.googleEventId) {
      const googleEventId = await this.calendar.createEvent({
        id: booking.id,
        startTime: new Date(booking.startTime),
        endTime: new Date(booking.endTime),
        status: 'CONFIRMADA',
        user: booking.user as any,
        service: booking.service as any,
      });

      if (googleEventId) {
        await this.bookingsRepo.update(booking.id, { googleEventId, calendarSync: 'SYNCED' } as any);
      } else {
        await this.bookingsRepo.update(booking.id, { calendarSync: 'FAILED' } as any);
        this.logger.warn(`No se pudo sincronizar el calendario para la cita ${booking.id}`);
      }
    }

    this.metaCapi.sendEvent({
      eventName: 'Schedule',
      eventId: `schedule-${booking.id}`,
      userData: {
        em: (booking.user as any)?.email ? hashCapiValue((booking.user as any).email) : undefined,
        ph: (booking.user as any)?.phone ? hashCapiPhone((booking.user as any).phone) : undefined,
        fbc: attribution?.fbc || undefined,
        fbp: attribution?.fbp || undefined,
      },
      customData: {
        currency: 'COP',
        value: (booking.service as any)?.price ? Number((booking.service as any).price) : undefined,
        contentName: (booking.service as any)?.name,
        bookingId: booking.id,
      },
    });

    return this.bookingsRepo.findById(booking.id);
  }

  /**
   * Parks a booking as PAGO_TARDE: the money arrived but there is no slot, so a
   * person of the salon has to assign one or refund. The write is conditional, so
   * a confirmation that won the race is never lost.
   */
  private async parkWithoutSlot(booking: IBookingSafe): Promise<void> {
    if (booking.googleEventId) {
      await this.calendar
        .deleteEvent(booking.googleEventId)
        .catch(() =>
          this.logger.warn(`No se pudo borrar el evento de la cita con pago tardío ${booking.id}`),
        );
    }

    const parked = await this.bookingsRepo.flagPaidWithoutSlot(booking.id);
    if (!parked) {
      this.logger.warn(`La cita ${booking.id} cambió de estado antes de marcarla como PAGO_TARDE`);
    }

    this.releaseSlotLock(booking.startTime);
  }

  private releaseSlotLock(startTime: Date): void {
    const dateKey = new Date(startTime).toISOString().split('T')[0];
    const lockKey = `slot:${dateKey}:${new Date(startTime).toISOString()}`;
    this.redis.del(lockKey).catch(() => {});
  }
}
