import { Payment } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface IPaymentSafe {
  id: string;
  bookingId: string;
  userId: string;
  amount: number;
  type: string;
  status: string;
  wompiPaymentId: string | null;
  wompiReference: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class IPaymentsRepository {
  abstract create(data: Prisma.PaymentCreateInput): Promise<Payment>;
  abstract findByBookingId(bookingId: string): Promise<IPaymentSafe[]>;
  abstract findApprovedByBookingId(bookingId: string): Promise<IPaymentSafe[]>;
  abstract findByWompiId(wompiPaymentId: string): Promise<IPaymentSafe>;
  abstract findByWompiReference(wompiReference: string): Promise<IPaymentSafe | null>;
  abstract update(id: string, data: Prisma.PaymentUpdateInput): Promise<IPaymentSafe>;
}
