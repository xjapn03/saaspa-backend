import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IPaymentsRepository } from './interfaces/payments.repository';

const paymentSelect = {
  id: true,
  bookingId: true,
  userId: true,
  amount: true,
  status: true,
  wompiPaymentId: true,
  wompiReference: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

@Injectable()
export class PaymentsRepository extends IPaymentsRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async create(data: Prisma.PaymentCreateInput) {
    return this.prisma.payment.create({ data });
  }

  async findByBookingId(bookingId: string) {
    return this.prisma.payment.findUnique({ where: { bookingId } });
  }

  async findByWompiId(wompiPaymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { wompiPaymentId },
      select: paymentSelect,
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    return payment;
  }

  async update(id: string, data: Prisma.PaymentUpdateInput) {
    await this.prisma.payment.update({
      where: { id },
      data,
      select: paymentSelect,
    });
    return this.prisma.payment.findUnique({
      where: { id },
      select: paymentSelect,
    }) as unknown as any;
  }
}
