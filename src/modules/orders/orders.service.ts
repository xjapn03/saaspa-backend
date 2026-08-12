import { Injectable } from '@nestjs/common';
import { IOrdersRepository, OrderFilters } from '../../repositories/interfaces/orders.repository';

@Injectable()
export class OrdersService {
  constructor(private ordersRepo: IOrdersRepository) {}

  async findAll(filters?: OrderFilters) { return this.ordersRepo.findAll(filters); }
  async findByUser(userId: string, filters?: { page?: number; limit?: number }) { return this.ordersRepo.findByUser(userId, filters); }
  async findById(id: string) { return this.ordersRepo.findById(id); }

  async create(data: {
    userId: string; total: number;
    shippingName: string; shippingEmail: string; shippingPhone: string;
    shippingAddress: string; shippingCity: string; shippingNotes?: string;
    paymentId?: string;
    items: { productId: string; name: string; price: number; quantity: number }[];
  }) {
    return this.ordersRepo.create(data);
  }

  async updateStatus(id: string, status: string) {
    return this.ordersRepo.updateStatus(id, status);
  }
}
