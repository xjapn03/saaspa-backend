import { Order, OrderItem } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface IOrderSafe {
  id: string;
  userId: string;
  total: number;
  status: string;
  shippingName: string;
  shippingEmail: string;
  shippingPhone: string;
  shippingAddress: string;
  shippingCity: string;
  shippingNotes: string | null;
  paymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  items?: IOrderItemSafe[];
  user?: { firstName: string; lastName: string; email: string };
}

export interface IOrderItemSafe {
  id: string;
  orderId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface OrderFilters {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export abstract class IOrdersRepository {
  abstract findAll(filters?: OrderFilters): Promise<IOrderSafe[]>;
  abstract findByUser(userId: string): Promise<IOrderSafe[]>;
  abstract findById(id: string): Promise<IOrderSafe>;
  abstract findByPaymentId(paymentId: string): Promise<IOrderSafe | null>;
  abstract create(data: { userId: string; total: number; shippingName: string; shippingEmail: string; shippingPhone: string; shippingAddress: string; shippingCity: string; shippingNotes?: string; paymentId?: string; items: { productId: string; name: string; price: number; quantity: number }[] }): Promise<Order>;
  abstract updateStatus(id: string, status: string): Promise<IOrderSafe>;
}
