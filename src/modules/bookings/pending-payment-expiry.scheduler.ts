import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { EXPIRY_SWEEP_INTERVAL_MS } from './booking.constants';

/**
 * Periodic sweep of bookings that never paid (joint triage, B-01).
 *
 * The payment window applied by the occupancy queries is what actually frees a
 * slot, so a delayed, failed or duplicated sweep never leaves the agenda
 * blocked: this job only normalises the status (PENDIENTE_PAGO -> EXPIRADA) so
 * the dashboard and the admin list agree with reality.
 *
 * A fixed interval instead of a cron expression: the sweep has no calendar
 * semantics and the project keeps its dependency set small (there is no
 * `@nestjs/schedule` here).
 */
@Injectable()
export class PendingPaymentExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PendingPaymentExpiryScheduler.name);
  private interval?: NodeJS.Timeout;

  constructor(private bookingsService: BookingsService) {}

  onModuleInit(): void {
    // One pass as soon as the app is up: bookings already stuck before this
    // deploy release their slots without waiting for the first interval.
    setTimeout(() => void this.sweep(), 0).unref();
    this.interval = setInterval(() => void this.sweep(), EXPIRY_SWEEP_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  /** Never throws: a failing sweep must not take the process down. */
  async sweep(): Promise<{ expired: number }> {
    try {
      return await this.bookingsService.expireOverduePendingBookings();
    } catch (error) {
      this.logger.error(
        `No se pudieron expirar las citas pendientes de pago: ${(error as Error)?.message}`,
      );
      return { expired: 0 };
    }
  }
}
