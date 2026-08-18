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
  createdAt: Date;
  updatedAt: Date;
  user?: { firstName: string; lastName: string; email: string; phone: string };
  service?: { name: string; duration: number; price: number };
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

export abstract class IBookingsRepository {
  abstract findAll(filters?: BookingFilters): Promise<PaginatedResult<IBookingSafe>>;
  abstract findById(id: string): Promise<IBookingSafe>;
  abstract findBySlot(serviceId: string, startTime: Date, endTime: Date): Promise<Booking | null>;
  abstract findOverlapping(startTime: Date, endTime: Date): Promise<Booking | null>;
  abstract findOccupied(date: string): Promise<{ startTime: Date; endTime: Date }[]>;
  abstract create(data: Prisma.BookingCreateInput): Promise<Booking>;
  abstract update(id: string, data: Prisma.BookingUpdateInput): Promise<IBookingSafe>;
  abstract findPendingCalendarSync(): Promise<IBookingSafe[]>;
}
