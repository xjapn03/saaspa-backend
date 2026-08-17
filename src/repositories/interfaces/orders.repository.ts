import { Order, OrderItem } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result';

export interface IOrderSafe {
  id: string; userId: string; total: number; status: string;
  shippingName: string; shippingEmail: string; shippingPhone: string;
  shippingAddress: string; shippingCity: string; shippingState: string | null; shippingNit: string | null; shippingNotes: string | null;
  paymentId: string | null; createdAt: Date; updatedAt: Date;
  items?: IOrderItemSafe[]; user?: { firstName: string; lastName: string; email: string; phone: string };
}

export interface IOrderItemSafe {
  id: string; orderId: string; productId: string; name: string; price: number; quantity: number;
}

export interface OrderFilters {
  search?: string; status?: string; dateFrom?: string; dateTo?: string;
  page?: number; limit?: number;
}

export abstract class IOrdersRepository {
  abstract findAll(filters?: OrderFilters): Promise<PaginatedResult<IOrderSafe>>;
  abstract findByUser(userId: string, filters?: { page?: number; limit?: number }): Promise<PaginatedResult<IOrderSafe>>;
  abstract findById(id: string): Promise<IOrderSafe>;
  abstract findByPaymentId(paymentId: string): Promise<IOrderSafe | null>;
  abstract create(data: { userId: string; total: number; shippingName: string; shippingEmail: string; shippingPhone: string; shippingAddress: string; shippingCity: string; shippingState?: string; shippingNit?: string; shippingNotes?: string; paymentId?: string; items: { productId: string; name: string; price: number; quantity: number }[] }): Promise<Order>;
  abstract updateStatus(id: string, status: string): Promise<IOrderSafe>;
}
