import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ICartRepository, ICartItemSafe } from './interfaces/cart.repository';

const cartSelect = {
  id: true,
  userId: true,
  productId: true,
  quantity: true,
  createdAt: true,
  updatedAt: true,
  product: { select: { id: true, name: true, price: true, mainImage: true } },
};

const toSafe = (item: any): ICartItemSafe => ({
  ...item,
  product: item.product ? { ...item.product, price: Number(item.product.price) } : undefined,
});

@Injectable()
export class CartRepository extends ICartRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async findByUser(userId: string): Promise<ICartItemSafe[]> {
    const items = await this.prisma.cartItem.findMany({
      where: { userId },
      select: cartSelect,
      orderBy: { createdAt: 'desc' },
    });
    return items.map(toSafe);
  }

  async upsert(userId: string, productId: string, quantity: number): Promise<ICartItemSafe> {
    const item = await this.prisma.cartItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, quantity },
      update: { quantity },
      select: cartSelect,
    });
    return toSafe(item);
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { userId, productId } });
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { userId } });
  }

  async merge(userId: string, items: { productId: string; quantity: number }[]): Promise<void> {
    for (const item of items) {
      await this.prisma.cartItem.upsert({
        where: { userId_productId: { userId, productId: item.productId } },
        create: { userId, productId: item.productId, quantity: item.quantity },
        update: { quantity: { increment: item.quantity } },
      });
    }
  }
}
