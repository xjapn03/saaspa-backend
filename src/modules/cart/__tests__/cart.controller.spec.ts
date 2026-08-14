import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { CartController } from '../cart.controller';
import { CartService } from '../cart.service';

describe('CartController', () => {
  let controller: CartController;
  let cartService: DeepMockProxy<CartService>;

  beforeEach(async () => {
    cartService = mockDeep<CartService>();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CartController],
      providers: [{ provide: CartService, useValue: cartService }],
    }).compile();
    controller = module.get<CartController>(CartController);
  });

  describe('getCart', () => {
    it('should delegate to service', async () => {
      cartService.getCart.mockResolvedValue([]);
      await controller.getCart('user-1');
      expect(cartService.getCart).toHaveBeenCalledWith('user-1');
    });
  });

  describe('addItem', () => {
    it('should add item with default quantity 1', async () => {
      await controller.addItem('user-1', { productId: 'prod-1' });
      expect(cartService.addItem).toHaveBeenCalledWith('user-1', 'prod-1', 1);
    });

    it('should add item with specified quantity', async () => {
      await controller.addItem('user-1', { productId: 'prod-1', quantity: 3 });
      expect(cartService.addItem).toHaveBeenCalledWith('user-1', 'prod-1', 3);
    });
  });

  describe('updateQuantity', () => {
    it('should delegate to service', async () => {
      await controller.updateQuantity('user-1', 'prod-1', { quantity: 2 });
      expect(cartService.updateQuantity).toHaveBeenCalledWith('user-1', 'prod-1', 2);
    });
  });

  describe('mergeCart', () => {
    it('should delegate to service', async () => {
      const items = [{ productId: 'prod-1', quantity: 2 }];
      await controller.mergeCart('user-1', { items });
      expect(cartService.mergeCart).toHaveBeenCalledWith('user-1', items);
    });
  });
});
