import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IPaymentsRepository, IPaymentSafe } from './interfaces/payments.repository';

const paymentSelect = {
  id: true,
  bookingId: true,
  userId: true,
  amount: true,
  type: true,
  status: true,
  wompiPaymentId: true,
  wompiReference: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

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
      select: paymentSelect,
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    return toSafe(payment);
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
}
