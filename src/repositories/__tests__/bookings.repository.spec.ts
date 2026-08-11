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
    user: { firstName: 'María', lastName: 'Gómez', email: 'maria@test.com' },
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
      const result = await repo.findAll();
      expect(result).toHaveLength(1);
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
    it('should find booking by service + time excluding CANCELADA', async () => {
      prisma.booking.findFirst.mockResolvedValue(mockRow as any);
      const result = await repo.findBySlot('svc-1', mockRow.startTime, mockRow.endTime);
      expect(result).toBeDefined();
      expect(prisma.booking.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: ['CANCELADA', 'NO_ASISTIO'] },
          }),
        }),
      );
    });
  });

  describe('findOccupied', () => {
    it('should return occupied time ranges for a date', async () => {
      prisma.booking.findMany.mockResolvedValue([
        { startTime: mockRow.startTime, endTime: mockRow.endTime },
      ] as any);
      const result = await repo.findOccupied('svc-1', '2026-08-15');
      expect(result).toHaveLength(1);
      expect(result[0].startTime).toBeDefined();
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
