import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  IBookingsRepository,
  BookingFilters,
  IBookingSafe,
  IdempotentBooking,
  IOverduePendingBooking,
  PaginatedResult,
} from './interfaces/bookings.repository';

/** Upper bound of bookings handled by one expiry sweep. */
const EXPIRY_BATCH_SIZE = 500;

const bookingSelect = {
  id: true,
  userId: true,
  serviceId: true,
  startTime: true,
  endTime: true,
  status: true,
  googleEventId: true,
  calendarSync: true,
  notes: true,
  idempotencyKey: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { firstName: true, lastName: true, email: true, phone: true } },
  service: { select: { name: true, duration: true, price: true } },
} satisfies Prisma.BookingSelect;

/** Postgres unique violation, as reported by Prisma. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class BookingsRepository extends IBookingsRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  /**
   * A booking holds its slot until it is cancelled, completed, missed or
   * expired; a PENDIENTE_PAGO one stops holding it once its payment window
   * closes, even if the sweep has not normalised the status yet. One shared rule
   * so availability and the overlap checks can never disagree.
   */
  private occupancyFilter(pendingPaymentDeadline: Date): Prisma.BookingWhereInput {
    return {
      NOT: [
        { status: { in: ['CANCELADA', 'NO_ASISTIO', 'EXPIRADA'] } },
        { status: 'PENDIENTE_PAGO', createdAt: { lt: pendingPaymentDeadline } },
      ],
    };
  }

  async findAll(filters: BookingFilters = {}): Promise<PaginatedResult<IBookingSafe>> {
    const where: Prisma.BookingWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.status) where.status = filters.status as any;
    if (filters.date) {
      const [yyyy, mm, dd] = filters.date.split('-').map(Number);
      const dayStart = new Date(yyyy, mm - 1, dd, 0, 0, 0);
      const dayEnd = new Date(yyyy, mm - 1, dd, 23, 59, 59, 999);
      where.startTime = { gte: dayStart, lte: dayEnd };
    }
    if (filters.search) {
      where.OR = [
        { user: { firstName: { contains: filters.search, mode: 'insensitive' } } },
        { user: { lastName: { contains: filters.search, mode: 'insensitive' } } },
        { service: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }
    const orderBy: Prisma.BookingOrderByWithRelationInput = {};
    const sortBy = filters.sortBy || 'startTime';
    const order = filters.order || 'desc';
    if (sortBy === 'startTime') orderBy.startTime = order;
    else if (sortBy === 'createdAt') orderBy.createdAt = order;
    else orderBy.startTime = 'desc';

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        select: bookingSelect,
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: data as unknown as IBookingSafe[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      select: bookingSelect,
    });
    if (!booking) throw new NotFoundException('Cita no encontrada');
    return booking as unknown as IBookingSafe;
  }

  async findBySlot(
    serviceId: string,
    startTime: Date,
    endTime: Date,
    pendingPaymentDeadline: Date,
  ) {
    return this.prisma.booking.findFirst({
      where: {
        serviceId,
        startTime,
        endTime,
        ...this.occupancyFilter(pendingPaymentDeadline),
      },
    });
  }

  async findOverlapping(startTime: Date, endTime: Date, pendingPaymentDeadline: Date) {
    return this.prisma.booking.findFirst({
      where: {
        ...this.occupancyFilter(pendingPaymentDeadline),
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  async findOccupied(date: string, pendingPaymentDeadline: Date) {
    const [yyyy, mm, dd] = date.split('-').map(Number);
    const dayStart = new Date(yyyy, mm - 1, dd, 0, 0, 0);
    const dayEnd = new Date(yyyy, mm - 1, dd, 23, 59, 59, 999);

    const bookings = await this.prisma.booking.findMany({
      where: {
        startTime: { gte: dayStart, lte: dayEnd },
        ...this.occupancyFilter(pendingPaymentDeadline),
      },
      select: { startTime: true, endTime: true },
    });
    return bookings.map((b) => ({ startTime: b.startTime, endTime: b.endTime }));
  }

  async create(data: Prisma.BookingCreateInput) {
    return this.prisma.booking.create({ data });
  }

  async createWithIdempotencyKey(
    data: Prisma.BookingCreateInput,
    idempotencyKey: string,
  ): Promise<IdempotentBooking> {
    try {
      const booking = await this.prisma.booking.create({
        data: { ...data, idempotencyKey },
      });
      return { booking, replayed: false };
    } catch (error) {
      // The unique index on the key is the atomicity primitive: whoever loses
      // the race reads the resource created by the winner (ADR 0012 point 4).
      if (!isUniqueViolation(error)) throw error;

      const existing = await this.prisma.booking.findUnique({ where: { idempotencyKey } });
      if (existing) return { booking: existing, replayed: true };

      throw error;
    }
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<IBookingSafe | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { idempotencyKey },
      select: bookingSelect,
    });
    return (booking as unknown as IBookingSafe) ?? null;
  }

  async update(id: string, data: Prisma.BookingUpdateInput) {
    await this.findById(id);
    return this.prisma.booking.update({
      where: { id },
      data,
      select: bookingSelect,
    }) as unknown as IBookingSafe;
  }

  async findPendingCalendarSync(): Promise<IBookingSafe[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMADA',
        calendarSync: { in: ['PENDING', 'FAILED'] },
      },
      select: bookingSelect,
      orderBy: { startTime: 'asc' },
    });
    return bookings as unknown as IBookingSafe[];
  }

  async countPendingByUser(userId: string, pendingPaymentDeadline: Date): Promise<number> {
    return this.prisma.booking.count({
      where: {
        userId,
        status: 'PENDIENTE_PAGO',
        createdAt: { gte: pendingPaymentDeadline },
      },
    });
  }

  async findOverduePending(pendingPaymentDeadline: Date): Promise<IOverduePendingBooking[]> {
    return this.prisma.booking.findMany({
      where: {
        status: 'PENDIENTE_PAGO',
        createdAt: { lt: pendingPaymentDeadline },
      },
      select: { id: true, startTime: true, googleEventId: true },
      orderBy: { createdAt: 'asc' },
      take: EXPIRY_BATCH_SIZE,
    });
  }

  async markExpired(id: string): Promise<boolean> {
    // Conditional on purpose: the sweep must not overwrite a booking that a
    // payment confirmed between the query and this write.
    const { count } = await this.prisma.booking.updateMany({
      where: { id, status: 'PENDIENTE_PAGO' },
      data: { status: 'EXPIRADA' },
    });
    return count === 1;
  }
}
