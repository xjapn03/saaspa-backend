import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { CartService } from '../cart.service';
import { ICartRepository } from '../../../repositories/interfaces/cart.repository';

describe('CartService', () => {
  let service: CartService;
  let repo: DeepMockProxy<ICartRepository>;

  const mockCartItem = {
    id: 'item-1',
    userId: 'user-1',
    productId: 'prod-1',
    quantity: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    repo = mockDeep<ICartRepository>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CartService, { provide: ICartRepository, useValue: repo }],
    }).compile();
    service = module.get<CartService>(CartService);
  });

  describe('getCart', () => {
    it('should return user cart items', async () => {
      repo.findByUser.mockResolvedValue([mockCartItem]);
      const result = await service.getCart('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('addItem', () => {
    it('should upsert item', async () => {
      repo.upsert.mockResolvedValue(mockCartItem);
      const result = await service.addItem('user-1', 'prod-1', 2);
      expect(result.quantity).toBe(2);
    });

    it('should throw if quantity <= 0', async () => {
      await expect(service.addItem('user-1', 'prod-1', 0)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateQuantity', () => {
    it('should remove item when quantity <= 0', async () => {
      const result = await service.updateQuantity('user-1', 'prod-1', 0);
      expect(result).toEqual({ removed: true });
      expect(repo.remove).toHaveBeenCalledWith('user-1', 'prod-1');
    });

    it('should upsert when quantity > 0', async () => {
      repo.upsert.mockResolvedValue({ ...mockCartItem, quantity: 5 });
      const result = await service.updateQuantity('user-1', 'prod-1', 5);
      expect(result.quantity).toBe(5);
      expect(repo.upsert).toHaveBeenCalledWith('user-1', 'prod-1', 5);
    });
  });

  describe('clearCart', () => {
    it('should clear all user items', async () => {
      const result = await service.clearCart('user-1');
      expect(result).toEqual({ cleared: true });
      expect(repo.clear).toHaveBeenCalledWith('user-1');
    });
  });

  describe('mergeCart', () => {
    it('should merge guest items and return full cart', async () => {
      repo.findByUser.mockResolvedValue([mockCartItem]);
      const items = [{ productId: 'prod-1', quantity: 3 }];
      const result = await service.mergeCart('user-1', items);
      expect(result).toHaveLength(1);
      expect(repo.merge).toHaveBeenCalledWith('user-1', items);
    });
  });
});
