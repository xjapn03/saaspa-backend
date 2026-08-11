import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IBookingsRepository, BookingFilters, IBookingSafe } from './interfaces/bookings.repository';

const bookingSelect = {
  id: true,
  userId: true,
  serviceId: true,
  startTime: true,
  endTime: true,
  status: true,
  googleEventId: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { firstName: true, lastName: true, email: true } },
  service: { select: { name: true, duration: true, price: true } },
} satisfies Prisma.BookingSelect;

@Injectable()
export class BookingsRepository extends IBookingsRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async findAll(filters: BookingFilters = {}) {
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

    return this.prisma.booking.findMany({
      where,
      select: bookingSelect,
      orderBy,
    }) as unknown as IBookingSafe[];
  }

  async findById(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      select: bookingSelect,
    });
    if (!booking) throw new NotFoundException('Cita no encontrada');
    return booking as unknown as IBookingSafe;
  }

  async findBySlot(serviceId: string, startTime: Date, endTime: Date) {
    return this.prisma.booking.findFirst({
      where: {
        serviceId,
        startTime,
        endTime,
        status: { notIn: ['CANCELADA', 'NO_ASISTIO'] },
      },
    });
  }

  async findOccupied(serviceId: string, date: string) {
    const [yyyy, mm, dd] = date.split('-').map(Number);
    const dayStart = new Date(yyyy, mm - 1, dd, 0, 0, 0);
    const dayEnd = new Date(yyyy, mm - 1, dd, 23, 59, 59, 999);

    const bookings = await this.prisma.booking.findMany({
      where: {
        serviceId,
        startTime: { gte: dayStart, lte: dayEnd },
        status: { notIn: ['CANCELADA', 'NO_ASISTIO'] },
      },
      select: { startTime: true, endTime: true },
    });
    return bookings.map((b) => ({ startTime: b.startTime, endTime: b.endTime }));
  }

  async create(data: Prisma.BookingCreateInput) {
    return this.prisma.booking.create({ data });
  }

  async update(id: string, data: Prisma.BookingUpdateInput) {
    await this.findById(id);
    return this.prisma.booking.update({
      where: { id },
      data,
      select: bookingSelect,
    }) as unknown as IBookingSafe;
  }
}
