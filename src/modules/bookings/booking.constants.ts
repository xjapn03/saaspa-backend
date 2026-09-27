import { ConfigService } from '@nestjs/config';

/**
 * Booking policy shared by the runtime, the payment webhook and the environment
 * validation: the payment window of a booking, the number of pending bookings a
 * user may hold, how long a slot is held in Redis and how often the sweep that
 * normalises overdue bookings runs.
 */

/**
 * Minutes a booking may stay PENDIENTE_PAGO before it stops holding its slot.
 * Evidence behind the number: the Redis slot lock covers the whole payment
 * window (`resolveSlotLockTtlSeconds`), a Wompi checkout is normally completed in
 * 2-10 minutes, and the salon agenda is an 8 hour day, so 30 minutes is a window
 * a slow client can still finish in while a single unpaid booking cannot eat an
 * afternoon.
 */
export const DEFAULT_PAYMENT_TTL_MINUTES = 30;

/**
 * Pending bookings one user may hold at the same time, so a single conversation
 * cannot block several slots before paying any of them. Two covers the normal
 * case (a booking in progress plus a correction or a second person) while
 * keeping the worst case bounded: two slots for the payment window.
 */
export const DEFAULT_MAX_PENDING_PER_USER = 2;

/**
 * How often the sweep runs. The payment window is what frees the slot (the
 * occupancy queries apply it), so this only has to be frequent enough for the
 * dashboard to show EXPIRADA soon after the window closes.
 */
export const EXPIRY_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Configured payment window, with the documented default as a fallback. One
 * definition for the occupancy queries, the sweep and the payment webhook, so
 * they can never disagree on when a slot stops being held.
 */
export function resolvePaymentTtlMinutes(config: ConfigService): number {
  const configured = Number(config.get('BOOKING_PAYMENT_TTL_MINUTES'));
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_PAYMENT_TTL_MINUTES;
}

/**
 * Instants older than this no longer count as a pending payment. A booking
 * created before the deadline has stopped holding its slot.
 */
export function pendingPaymentDeadline(config: ConfigService, now: Date = new Date()): Date {
  return new Date(now.getTime() - resolvePaymentTtlMinutes(config) * 60000);
}

/**
 * TTL of the Redis slot hold: the whole payment window plus one sweep interval.
 * Before H-01 the hold was a fixed 10 minutes while the window was 30, so during
 * the last 20 minutes only the database row kept the slot busy. The row remains
 * the source of truth; this only keeps the fast path alive as long as the
 * booking can legitimately hold the slot (the sweep interval covers the lag
 * between the window closing and the sweep releasing the key).
 */
export function resolveSlotLockTtlSeconds(config: ConfigService): number {
  return resolvePaymentTtlMinutes(config) * 60 + EXPIRY_SWEEP_INTERVAL_MS / 1000;
}
