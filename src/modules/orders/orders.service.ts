import { Injectable } from '@nestjs/common';
import { IOrdersRepository } from '../../../repositories/interfaces/orders.repository';

@Injectable()
export class OrdersService {
  constructor(private ordersRepo: IOrdersRepository) {}

  async findAll() { return this.ordersRepo.findAll(); }
  async findByUser(userId: string) { return this.ordersRepo.findByUser(userId); }
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
