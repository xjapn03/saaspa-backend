import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../database/prisma.service';
import { BookingsRepository } from '../bookings.repository';

describe('BookingsRepository', () => {
  let repo: BookingsRepository;
  let prisma: DeepMockProxy<PrismaService>;

  const mockRow = {
    id: 'booking-1',
    userId: 'user-1',
    serviceId: 'svc-1',
    startTime: new Date('2026-08-15T10:00:00.000Z'),
    endTime: new Date('2026-08-15T11:00:00.000Z'),
    status: 'PENDIENTE_PAGO',
    googleEventId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { firstName: 'María', lastName: 'Gómez', email: 'maria@test.com', phone: '3001234567' },
    service: { name: 'Facial', duration: 60, price: 100000 },
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [BookingsRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get<BookingsRepository>(BookingsRepository);
  });

  describe('findAll', () => {
    it('should return all bookings when no filters', async () => {
      prisma.booking.findMany.mockResolvedValue([mockRow] as any);
      prisma.booking.count.mockResolvedValue(1);
      const result = await repo.findAll();
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by userId', async () => {
      prisma.booking.findMany.mockResolvedValue([mockRow] as any);
      await repo.findAll({ userId: 'user-1' });
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }),
      );
    });

    it('should filter by status', async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      await repo.findAll({ status: 'CONFIRMADA' });
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'CONFIRMADA' }) }),
      );
    });

    it('should filter by date range', async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      await repo.findAll({ date: '2026-08-15' });
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startTime: { gte: expect.any(Date), lte: expect.any(Date) },
          }),
        }),
      );
    });

    it('should order by startTime desc by default', async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      await repo.findAll();
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { startTime: 'desc' } }),
      );
    });
  });

  describe('findById', () => {
    it('should return booking when found', async () => {
      prisma.booking.findUnique.mockResolvedValue(mockRow as any);
      const result = await repo.findById('booking-1');
      expect(result.id).toBe('booking-1');
    });

    it('should throw NotFoundException when missing', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(repo.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySlot', () => {
    it('should find booking by service + time excluding the statuses that free the slot', async () => {
      prisma.booking.findFirst.mockResolvedValue(mockRow as any);
      const deadline = new Date('2026-08-15T09:00:00.000Z');
      const result = await repo.findBySlot('svc-1', mockRow.startTime, mockRow.endTime, deadline);
      expect(result).toBeDefined();
      expect(prisma.booking.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            serviceId: 'svc-1',
            NOT: [
              { status: { in: ['CANCELADA', 'NO_ASISTIO', 'EXPIRADA'] } },
              { status: 'PENDIENTE_PAGO', createdAt: { lt: deadline } },
            ],
          }),
        }),
      );
    });
  });

  describe('findOverlapping', () => {
    it('should find any booking overlapping the time range regardless of service', async () => {
      prisma.booking.findFirst.mockResolvedValue(mockRow as any);
      const deadline = new Date('2026-08-15T09:00:00.000Z');
      const result = await repo.findOverlapping(mockRow.startTime, mockRow.endTime, deadline);
      expect(result).toBeDefined();
      expect(prisma.booking.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startTime: { lt: mockRow.endTime },
            endTime: { gt: mockRow.startTime },
            NOT: [
              { status: { in: ['CANCELADA', 'NO_ASISTIO', 'EXPIRADA'] } },
              { status: 'PENDIENTE_PAGO', createdAt: { lt: deadline } },
            ],
          }),
        }),
      );
    });

    it('should not treat an overdue pending payment as an overlap', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      const deadline = new Date('2026-08-15T09:00:00.000Z');

      await repo.findOverlapping(mockRow.startTime, mockRow.endTime, deadline);

      const call = prisma.booking.findFirst.mock.calls[0][0] as any;
      // The rule is one clause shared with findOccupied: a pending payment older
      // than the deadline stops holding its slot.
      expect(call.where.NOT).toContainEqual({
        status: 'PENDIENTE_PAGO',
        createdAt: { lt: deadline },
      });
    });
  });

  describe('findOccupied', () => {
    it('should return occupied time ranges for a date across all services', async () => {
      prisma.booking.findMany.mockResolvedValue([
        { startTime: mockRow.startTime, endTime: mockRow.endTime },
      ] as any);
      const deadline = new Date('2026-08-15T09:00:00.000Z');
      const result = await repo.findOccupied('2026-08-15', deadline);
      expect(result).toHaveLength(1);
      expect(result[0].startTime).toBeDefined();
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startTime: { gte: expect.any(Date), lte: expect.any(Date) },
            NOT: [
              { status: { in: ['CANCELADA', 'NO_ASISTIO', 'EXPIRADA'] } },
              { status: 'PENDIENTE_PAGO', createdAt: { lt: deadline } },
            ],
          }),
        }),
      );
    });
  });

  describe('countPendingByUser', () => {
    it('should count only the pending payments inside their window', async () => {
      prisma.booking.count.mockResolvedValue(2);
      const deadline = new Date('2026-08-15T09:00:00.000Z');

      const result = await repo.countPendingByUser('user-1', deadline);

      expect(result).toBe(2);
      expect(prisma.booking.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          status: 'PENDIENTE_PAGO',
          createdAt: { gte: deadline },
        },
      });
    });
  });

  describe('findOverduePending', () => {
    it('should return the oldest pending payments past the deadline', async () => {
      prisma.booking.findMany.mockResolvedValue([
        { id: 'booking-1', startTime: mockRow.startTime, googleEventId: null },
      ] as any);
      const deadline = new Date('2026-08-15T09:00:00.000Z');

      const result = await repo.findOverduePending(deadline);

      expect(result).toEqual([
        { id: 'booking-1', startTime: mockRow.startTime, googleEventId: null },
      ]);
      expect(prisma.booking.findMany).toHaveBeenCalledWith({
        where: { status: 'PENDIENTE_PAGO', createdAt: { lt: deadline } },
        select: { id: true, startTime: true, googleEventId: true },
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
    });
  });

  describe('markExpired', () => {
    it('should report true when the booking was still pending', async () => {
      prisma.booking.updateMany.mockResolvedValue({ count: 1 } as any);

      await expect(repo.markExpired('booking-1')).resolves.toBe(true);

      expect(prisma.booking.updateMany).toHaveBeenCalledWith({
        where: { id: 'booking-1', status: 'PENDIENTE_PAGO' },
        data: { status: 'EXPIRADA' },
      });
    });

    it('should report false when a payment confirmed it first', async () => {
      prisma.booking.updateMany.mockResolvedValue({ count: 0 } as any);

      await expect(repo.markExpired('booking-1')).resolves.toBe(false);
    });
  });

  describe('create', () => {
    it('should create and return new booking', async () => {
      prisma.booking.create.mockResolvedValue(mockRow as any);
      const data = {
        user: { connect: { id: 'user-1' } },
        service: { connect: { id: 'svc-1' } },
        startTime: mockRow.startTime,
        endTime: mockRow.endTime,
      };
      const result = await repo.create(data as any);
      expect(result.id).toBe('booking-1');
      expect(prisma.booking.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('update', () => {
    it('should update booking and return safe data', async () => {
      prisma.booking.findUnique.mockResolvedValue(mockRow as any);
      prisma.booking.update.mockResolvedValue({ ...mockRow, status: 'CONFIRMADA' } as any);
      const result = await repo.update('booking-1', { status: 'CONFIRMADA' } as any);
      expect(result.status).toBe('CONFIRMADA');
    });

    it('should throw NotFoundException if booking does not exist', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(repo.update('nonexistent', {} as any)).rejects.toThrow(NotFoundException);
    });
  });
});
