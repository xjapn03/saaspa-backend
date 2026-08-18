import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../database/prisma.service';
import { PaymentsRepository } from '../payments.repository';

describe('PaymentsRepository', () => {
  let repo: PaymentsRepository;
  let prisma: DeepMockProxy<PrismaService>;

  const mockPayment = {
    id: 'pay-1', bookingId: 'booking-1', userId: 'user-1',
    amount: { toNumber: () => 30000 }, type: 'ABONO', status: 'APROBADO',
    wompiPaymentId: 'wompi-1', wompiReference: 'ref-1', metadata: null,
    paidAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    user: { firstName: 'Test', lastName: 'User', email: 'test@test.com', phone: '3001234567' },
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentsRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get<PaymentsRepository>(PaymentsRepository);
  });

  describe('findByBookingId', () => {
    it('should return array of payments', async () => {
      prisma.payment.findMany.mockResolvedValue([mockPayment] as any);
      const result = await repo.findByBookingId('booking-1');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('ABONO');
    });
  });

  describe('findApprovedByBookingId', () => {
    it('should filter by APROBADO status', async () => {
      prisma.payment.findMany.mockResolvedValue([mockPayment] as any);
      await repo.findApprovedByBookingId('booking-1');
      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { bookingId: 'booking-1', status: 'APROBADO' } }),
      );
    });
  });

  describe('findByWompiId', () => {
    it('should throw NotFoundException when not found', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);
      await expect(repo.findByWompiId('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should return payment with user info', async () => {
      prisma.payment.findFirst.mockResolvedValue(mockPayment as any);
      const result = await repo.findByWompiId('wompi-1');
      expect(result.wompiPaymentId).toBe('wompi-1');
    });
  });

  describe('create', () => {
    it('should create payment', async () => {
      prisma.payment.create.mockResolvedValue(mockPayment as any);
      const result = await repo.create({ booking: { connect: { id: 'booking-1' } } } as any);
      expect(result.id).toBe('pay-1');
    });
  });
});
