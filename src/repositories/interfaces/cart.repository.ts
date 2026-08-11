import { CartItem } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface ICartItemSafe {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
  product?: { id: string; name: string; price: number; mainImage: string | null };
}

export abstract class ICartRepository {
  abstract findByUser(userId: string): Promise<ICartItemSafe[]>;
  abstract upsert(userId: string, productId: string, quantity: number): Promise<ICartItemSafe>;
  abstract remove(userId: string, productId: string): Promise<void>;
  abstract clear(userId: string): Promise<void>;
  abstract merge(userId: string, items: { productId: string; quantity: number }[]): Promise<void>;
}
