import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IPaymentsRepository, IPaymentSafe, PaymentTransactionFilters } from './interfaces/payments.repository';
import { paginated, PaginatedResult } from '../common/interfaces/paginated-result';

const paymentSelect = {
  id: true,
  bookingId: true,
  userId: true,
  amount: true,
  type: true,
  status: true,
  wompiPaymentId: true,
  wompiReference: true,
  metadata: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

const paymentSelectWithUser = {
  ...paymentSelect,
  user: { select: { firstName: true, lastName: true, email: true } },
};

const paymentTransactionSelect = {
  id: true, bookingId: true, userId: true, amount: true, type: true,
  status: true, wompiPaymentId: true, wompiReference: true, paymentMethod: true, metadata: true,
  paidAt: true, createdAt: true, updatedAt: true,
  user: { select: { firstName: true, lastName: true, email: true } },
  booking: { select: { id: true, startTime: true, service: { select: { name: true } } } },
  order: { select: { id: true, total: true } },
};

const toSafe = (p: any): IPaymentSafe => ({
  ...p,
  amount: Number(p.amount),
});

@Injectable()
export class PaymentsRepository extends IPaymentsRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async create(data: Prisma.PaymentCreateInput) {
    return this.prisma.payment.create({ data });
  }

  async findByBookingId(bookingId: string): Promise<IPaymentSafe[]> {
    const payments = await this.prisma.payment.findMany({
      where: { bookingId },
      select: paymentSelect,
      orderBy: { createdAt: 'desc' },
    });
    return payments.map(toSafe);
  }

  async findApprovedByBookingId(bookingId: string): Promise<IPaymentSafe[]> {
    const payments = await this.prisma.payment.findMany({
      where: { bookingId, status: 'APROBADO' },
      select: paymentSelect,
      orderBy: { createdAt: 'desc' },
    });
    return payments.map(toSafe);
  }

  async findByWompiId(wompiPaymentId: string): Promise<IPaymentSafe> {
    const payment = await this.prisma.payment.findFirst({
      where: { wompiPaymentId },
      select: paymentSelectWithUser,
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    return toSafe(payment);
  }

  async findByWompiReference(wompiReference: string): Promise<IPaymentSafe | null> {
    const payment = await this.prisma.payment.findFirst({
      where: { wompiReference },
      select: paymentSelectWithUser,
    });
    return payment ? toSafe(payment) : null;
  }

  async update(id: string, data: Prisma.PaymentUpdateInput): Promise<IPaymentSafe> {
    await this.prisma.payment.update({
      where: { id },
      data,
      select: paymentSelect,
    });
    const updated = await this.prisma.payment.findUnique({
      where: { id },
      select: paymentSelect,
    });
    return toSafe(updated!);
  }

  async findAllTransactions(filters?: PaymentTransactionFilters): Promise<PaginatedResult<IPaymentSafe>> {
    const where: any = {};

    if (filters?.search) {
      const q = filters.search;
      where.OR = [
        { wompiReference: { contains: q, mode: 'insensitive' } },
        { user: { firstName: { contains: q, mode: 'insensitive' } } },
        { user: { lastName: { contains: q, mode: 'insensitive' } } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (filters?.type) where.type = filters.type;
    if (filters?.status) where.status = filters.status;

    if (filters?.dateFrom || filters?.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo + 'T23:59:59.999Z');
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const mapPayment = (p: any) => ({
      ...p, amount: Number(p.amount),
      booking: p.booking ? { ...p.booking, service: p.booking.service } : null,
      order: p.order ? { ...p.order, total: Number(p.order.total) } : null,
      metadata: p.metadata,
    });

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({ where, select: paymentTransactionSelect, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.payment.count({ where }),
    ]);
    return paginated(data.map(mapPayment), total, page, limit);
  }

  async findRevenue(month: string): Promise<number> {
    const [year, m] = month.split('-').map(Number);
    const start = new Date(year, m - 1, 1);
    const end = new Date(year, m, 1);

    const result = await this.prisma.payment.aggregate({
      where: {
        status: 'APROBADO',
        paidAt: { gte: start, lt: end },
      },
      _sum: { amount: true },
    });

    return Number(result._sum.amount || 0);
  }
}
