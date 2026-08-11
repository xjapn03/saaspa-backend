import { Injectable, BadRequestException } from '@nestjs/common';
import { ICartRepository } from '../../repositories/interfaces/cart.repository';

@Injectable()
export class CartService {
  constructor(private cartRepo: ICartRepository) {}

  async getCart(userId: string) {
    return this.cartRepo.findByUser(userId);
  }

  async addItem(userId: string, productId: string, quantity: number = 1) {
    if (quantity <= 0) throw new BadRequestException('quantity debe ser mayor a 0');
    return this.cartRepo.upsert(userId, productId, quantity);
  }

  async updateQuantity(userId: string, productId: string, quantity: number) {
    if (quantity <= 0) {
      await this.cartRepo.remove(userId, productId);
      return { removed: true };
    }
    return this.cartRepo.upsert(userId, productId, quantity);
  }

  async removeItem(userId: string, productId: string) {
    await this.cartRepo.remove(userId, productId);
    return { removed: true };
  }

  async clearCart(userId: string) {
    await this.cartRepo.clear(userId);
    return { cleared: true };
  }

  async mergeCart(userId: string, items: { productId: string; quantity: number }[]) {
    await this.cartRepo.merge(userId, items);
    return this.cartRepo.findByUser(userId);
  }
}
