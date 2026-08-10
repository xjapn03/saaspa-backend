import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { CouponsService } from '../coupons.service';
import { ICouponsRepository } from '../../../repositories/interfaces/coupons.repository';

describe('CouponsService', () => {
  let service: CouponsService;
  let repo: DeepMockProxy<ICouponsRepository>;

  const mockCoupon = {
    id: 'coupon-1',
    code: 'BIENVENIDA15',
    discount: 0.15,
    isUsed: false,
    expiresAt: new Date('2026-12-31'),
    userId: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    repo = mockDeep<ICouponsRepository>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouponsService,
        { provide: ICouponsRepository, useValue: repo },
      ],
    }).compile();

    service = module.get<CouponsService>(CouponsService);
  });

  describe('create', () => {
    it('should create a coupon with uppercase code', async () => {
      repo.findByCode.mockResolvedValue(null);
      repo.create.mockResolvedValue({ ...mockCoupon, code: 'BIENVENIDA15' } as any);

      const result = await service.create({
        code: 'bienvenida15',
        discount: 0.15,
        expiresAt: '2026-12-31',
      });

      expect(result.code).toBe('BIENVENIDA15');
      expect(repo.findByCode).toHaveBeenCalledWith('bienvenida15');
    });

    it('should throw ConflictException when code already exists', async () => {
      repo.findByCode.mockResolvedValue(mockCoupon as any);

      await expect(
        service.create({ code: 'BIENVENIDA15', discount: 0.15, expiresAt: '2026-12-31' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create coupon with userId when provided', async () => {
      repo.findByCode.mockResolvedValue(null);
      repo.create.mockResolvedValue({ ...mockCoupon, userId: 'user-1' } as any);

      const result = await service.create({
        code: 'PERSONAL10',
        discount: 0.10,
        expiresAt: '2026-12-31',
        userId: 'user-1',
      });

      expect(result.userId).toBe('user-1');
    });
  });

  describe('validate', () => {
    it('should return valid coupon info', async () => {
      repo.findByCode.mockResolvedValue(mockCoupon as any);

      const result = await service.validate({ code: 'BIENVENIDA15' });

      expect(result.valid).toBe(true);
      expect(result.discount).toBe(0.15);
      expect(result.code).toBe('BIENVENIDA15');
    });

    it('should throw when coupon not found', async () => {
      repo.findByCode.mockResolvedValue(null);

      await expect(service.validate({ code: 'INVALID' })).rejects.toThrow('Cupón no válido');
    });

    it('should throw when coupon is already used', async () => {
      repo.findByCode.mockResolvedValue({ ...mockCoupon, isUsed: true } as any);

      await expect(service.validate({ code: 'BIENVENIDA15' })).rejects.toThrow('ya fue usado');
    });

    it('should throw when coupon is expired', async () => {
      repo.findByCode.mockResolvedValue({
        ...mockCoupon,
        expiresAt: new Date('2020-01-01'),
      } as any);

      await expect(service.validate({ code: 'BIENVENIDA15' })).rejects.toThrow('expiró');
    });
  });

  describe('markAsUsed', () => {
    it('should mark coupon as used', async () => {
      repo.findById.mockResolvedValue(mockCoupon as any);
      repo.update.mockResolvedValue({ ...mockCoupon, isUsed: true } as any);

      const result = await service.markAsUsed('coupon-1');

      expect(result.isUsed).toBe(true);
    });

    it('should throw when coupon is already used', async () => {
      repo.findById.mockResolvedValue({ ...mockCoupon, isUsed: true } as any);

      await expect(service.markAsUsed('coupon-1')).rejects.toThrow('ya fue usado');
    });
  });

  describe('findAll', () => {
    it('should return all coupons', async () => {
      repo.findAll.mockResolvedValue([mockCoupon as any]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(repo.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('should call repo.remove', async () => {
      repo.remove.mockResolvedValue(undefined);

      await service.remove('coupon-1');

      expect(repo.remove).toHaveBeenCalledWith('coupon-1');
    });
  });
});
