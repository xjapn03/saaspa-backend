import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../database/prisma.service';
import { CouponsRepository } from '../coupons.repository';

describe('CouponsRepository', () => {
  let repo: CouponsRepository;
  let prisma: DeepMockProxy<PrismaService>;

  const mockCoupon = {
    id: 'coupon-1', code: 'DESC20', discount: 0.2, isUsed: false,
    expiresAt: new Date('2026-12-31'), userId: null, createdAt: new Date(),
    user: null,
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CouponsRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get<CouponsRepository>(CouponsRepository);
  });

  describe('findAll', () => {
    it('should return all coupons ordered by createdAt desc', async () => {
      prisma.coupon.findMany.mockResolvedValue([mockCoupon] as any);
      const result = await repo.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException when missing', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null);
      await expect(repo.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByCode', () => {
    it('should return coupon by code', async () => {
      prisma.coupon.findUnique.mockResolvedValue(mockCoupon as any);
      const result = await repo.findByCode('DESC20');
      expect(result?.code).toBe('DESC20');
    });

    it('should return null when not found', async () => {
      prisma.coupon.findUnique.mockResolvedValue(null);
      const result = await repo.findByCode('NOPE');
      expect(result).toBeNull();
    });
  });
});
