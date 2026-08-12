import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { CouponsController } from '../coupons.controller';
import { CouponsService } from '../coupons.service';

describe('CouponsController', () => {
  let controller: CouponsController;
  let service: DeepMockProxy<CouponsService>;

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
    service = mockDeep<CouponsService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CouponsController],
      providers: [
        { provide: CouponsService, useValue: service },
      ],
    }).compile();

    controller = module.get<CouponsController>(CouponsController);
  });

  describe('findAll', () => {
    it('should return list of coupons', async () => {
      service.findAll.mockResolvedValue({ data: [mockCoupon as any], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await controller.findAll();
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return a coupon by id', async () => {
      service.findById.mockResolvedValue(mockCoupon as any);
      const result = await controller.findById('coupon-1');
      expect(result.id).toBe('coupon-1');
    });
  });

  describe('create', () => {
    it('should create a coupon', async () => {
      service.create.mockResolvedValue(mockCoupon as any);
      const result = await controller.create({
        code: 'BIENVENIDA15',
        discount: 0.15,
        expiresAt: '2026-12-31',
      });
      expect(result.code).toBe('BIENVENIDA15');
    });
  });

  describe('validate', () => {
    it('should validate a coupon code', async () => {
      service.validate.mockResolvedValue({ ...mockCoupon, valid: true } as any);
      const result = await controller.validate({ code: 'BIENVENIDA15' });
      expect(result.valid).toBe(true);
    });
  });

  describe('markAsUsed', () => {
    it('should mark coupon as used', async () => {
      service.markAsUsed.mockResolvedValue({ ...mockCoupon, isUsed: true } as any);
      const result = await controller.markAsUsed('coupon-1');
      expect(result.isUsed).toBe(true);
    });
  });

  describe('remove', () => {
    it('should delete a coupon', async () => {
      service.remove.mockResolvedValue(undefined);
      await expect(controller.remove('coupon-1')).resolves.toBeUndefined();
    });
  });
});
