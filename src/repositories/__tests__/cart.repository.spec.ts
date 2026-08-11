import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../database/prisma.service';
import { CartRepository } from '../cart.repository';

describe('CartRepository', () => {
  let repo: CartRepository;
  let prisma: DeepMockProxy<PrismaService>;

  const mockItem = {
    id: 'item-1', userId: 'user-1', productId: 'prod-1', quantity: 2,
    createdAt: new Date(), updatedAt: new Date(),
    product: { id: 'prod-1', name: 'Test', price: { toNumber: () => 1000 }, mainImage: null },
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CartRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get<CartRepository>(CartRepository);
  });

  describe('findByUser', () => {
    it('should return cart items with product info', async () => {
      prisma.cartItem.findMany.mockResolvedValue([mockItem] as any);
      const result = await repo.findByUser('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(2);
    });
  });

  describe('upsert', () => {
    it('should create or update item', async () => {
      prisma.cartItem.upsert.mockResolvedValue({ ...mockItem, quantity: 3 } as any);
      const result = await repo.upsert('user-1', 'prod-1', 3);
      expect(result.quantity).toBe(3);
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: { userId: 'user-1', productId: 'prod-1', quantity: 3 } }),
      );
    });
  });

  describe('remove', () => {
    it('should delete cart item', async () => {
      await repo.remove('user-1', 'prod-1');
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', productId: 'prod-1' } }),
      );
    });
  });

  describe('clear', () => {
    it('should delete all user cart items', async () => {
      await repo.clear('user-1');
      expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
    });
  });

  describe('merge', () => {
    it('should upsert each guest item with increment', async () => {
      const items = [{ productId: 'prod-1', quantity: 2 }, { productId: 'prod-2', quantity: 1 }];
      await repo.merge('user-1', items);
      expect(prisma.cartItem.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { quantity: { increment: 2 } } }),
      );
    });
  });
});
