import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { IOrdersRepository, IOrderSafe } from './interfaces/orders.repository';

const orderSelect = {
  id: true, userId: true, total: true, status: true,
  shippingName: true, shippingEmail: true, shippingPhone: true,
  shippingAddress: true, shippingCity: true, shippingNotes: true,
  paymentId: true, createdAt: true, updatedAt: true,
  user: { select: { firstName: true, lastName: true, email: true } },
  items: {
    select: { id: true, orderId: true, productId: true, name: true, price: true, quantity: true },
    orderBy: { createdAt: 'asc' as const },
  },
};

@Injectable()
export class OrdersRepository extends IOrdersRepository {
  constructor(private prisma: PrismaService) { super(); }

  async findAll(): Promise<IOrderSafe[]> {
    const orders = await this.prisma.order.findMany({
      select: orderSelect, orderBy: { createdAt: 'desc' },
    });
    return orders.map(o => ({ ...o, total: Number(o.total), items: o.items.map(i => ({ ...i, price: Number(i.price) })) })) as any;
  }

  async findByUser(userId: string): Promise<IOrderSafe[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId }, select: orderSelect, orderBy: { createdAt: 'desc' },
    });
    return orders.map(o => ({ ...o, total: Number(o.total), items: o.items.map(i => ({ ...i, price: Number(i.price) })) })) as any;
  }

  async findById(id: string): Promise<IOrderSafe> {
    const order = await this.prisma.order.findUnique({ where: { id }, select: orderSelect });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return { ...order, total: Number(order.total), items: order.items.map(i => ({ ...i, price: Number(i.price) })) } as any;
  }

  async create(data: any) {
    const { items, ...orderData } = data;
    return this.prisma.order.create({
      data: {
        ...orderData,
        total: data.total,
        user: { connect: { id: data.userId } },
        ...(data.paymentId ? { payment: { connect: { id: data.paymentId } } } : {}),
        items: { create: items.map((i: any) => ({ productId: i.productId, name: i.name, price: i.price, quantity: i.quantity })) },
      },
    });
  }

  async updateStatus(id: string, status: string): Promise<IOrderSafe> {
    await this.findById(id);
    const updated = await this.prisma.order.update({
      where: { id }, data: { status: status as any }, select: orderSelect,
    });
    return { ...updated, total: Number(updated.total), items: updated.items.map(i => ({ ...i, price: Number(i.price) })) } as any;
  }
}
