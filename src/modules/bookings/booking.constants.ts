/**
 * Booking policy shared by the runtime and the environment validation: the
 * payment window of a booking, the number of pending bookings a user may hold
 * and how often the sweep that normalises overdue bookings runs.
 */

/**
 * Minutes a booking may stay PENDIENTE_PAGO before it stops holding its slot.
 * Evidence behind the number: the Redis slot lock already holds a slot for 10
 * minutes (`LOCK_TTL`), a Wompi checkout is normally completed in 2-10 minutes,
 * and the salon agenda is an 8 hour day, so 30 minutes is a window a slow client
 * can still finish in while a single unpaid booking cannot eat an afternoon.
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
