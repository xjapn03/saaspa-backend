import { Booking } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface IBookingSafe {
  id: string;
  userId: string;
  serviceId: string;
  startTime: Date;
  endTime: Date;
  status: string;
  googleEventId: string | null;
  calendarSync?: string;
  notes: string | null;
  idempotencyKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: { firstName: string; lastName: string; email: string; phone: string };
  service?: { name: string; duration: number; price: number };
}

/**
 * Result of an idempotent creation: `replayed` is true when the key was already
 * used, so `booking` is the resource created by the first call.
 */
export interface IdempotentBooking {
  booking: Booking;
  replayed: boolean;
}

export interface BookingFilters {
  userId?: string;
  date?: string;
  status?: string;
  search?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Pending payment that outlived its window and must release its slot. */
export interface IOverduePendingBooking {
  id: string;
  startTime: Date;
  googleEventId: string | null;
}

export abstract class IBookingsRepository {
  abstract findAll(filters?: BookingFilters): Promise<PaginatedResult<IBookingSafe>>;
  abstract findById(id: string): Promise<IBookingSafe>;
  abstract findBySlot(
    serviceId: string,
    startTime: Date,
    endTime: Date,
    pendingPaymentDeadline: Date,
  ): Promise<Booking | null>;
  /**
   * Any booking that would overlap the range and still holds its slot.
   * `excludeBookingId` lets the caller ignore the booking being acted on (the
   * one that is being confirmed or moved), which otherwise counts as its own
   * overlap.
   */
  abstract findOverlapping(
    startTime: Date,
    endTime: Date,
    pendingPaymentDeadline: Date,
    excludeBookingId?: string,
  ): Promise<Booking | null>;
  abstract findOccupied(
    date: string,
    pendingPaymentDeadline: Date,
  ): Promise<{ startTime: Date; endTime: Date }[]>;
  abstract create(data: Prisma.BookingCreateInput): Promise<Booking>;
  /**
   * Creates the booking carrying the idempotency key; when the key is already
   * taken it returns the booking created by the first call (ADR 0008/0012).
   */
  abstract createWithIdempotencyKey(
    data: Prisma.BookingCreateInput,
    idempotencyKey: string,
  ): Promise<IdempotentBooking>;
  abstract findByIdempotencyKey(idempotencyKey: string): Promise<IBookingSafe | null>;
  abstract update(id: string, data: Prisma.BookingUpdateInput): Promise<IBookingSafe>;
  abstract findPendingCalendarSync(): Promise<IBookingSafe[]>;
  /** Pending payments that still count against the user's cap. */
  abstract countPendingByUser(userId: string, pendingPaymentDeadline: Date): Promise<number>;
  /** Bookings to expire, oldest first. */
  abstract findOverduePending(pendingPaymentDeadline: Date): Promise<IOverduePendingBooking[]>;
  /** Moves one booking to EXPIRADA only if it is still PENDIENTE_PAGO. */
  abstract markExpired(id: string): Promise<boolean>;
  /**
   * Parks a booking whose payment arrived too late as PAGO_TARDE (H-01).
   * Conditional, so it never overwrites a confirmation that won the race; false
   * means someone else changed the booking first.
   */
  abstract flagPaidWithoutSlot(id: string): Promise<boolean>;
}
