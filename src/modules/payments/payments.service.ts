import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { IPaymentsRepository } from '../../repositories/interfaces/payments.repository';
import { IBookingsRepository } from '../../repositories/interfaces/bookings.repository';
import { MetaCapiService } from '../meta/meta-capi.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private paymentsRepo: IPaymentsRepository,
    private bookingsRepo: IBookingsRepository,
    private config: ConfigService,
    private metaCapi: MetaCapiService,
  ) {}

  generateIntegritySignature(reference: string, amountInCents: number, currency: string): string {
    const secret = this.config.get<string>('WOMPI_INTEGRITY_SECRET') || 'integ_test_xxx';
    const data = `${reference}${amountInCents}${currency}${secret}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async initPayment(bookingId: string, type: 'ABONO' | 'SALDO' = 'ABONO') {
    const booking = await this.bookingsRepo.findById(bookingId);
    const servicePrice = Number((booking.service as any).price);
    let amountInCents: number;
    let amount: number;

    if (type === 'ABONO') {
      if (booking.status !== 'PENDIENTE_PAGO') {
        throw new BadRequestException('La cita no está pendiente de pago');
      }
      amount = servicePrice * 0.3;
      amountInCents = Math.round(amount * 100);
    } else {
      if (booking.status !== 'CONFIRMADA') {
        throw new BadRequestException('Solo citas confirmadas pueden recibir pago de saldo');
      }
      const approved = await this.paymentsRepo.findApprovedByBookingId(bookingId);
      const totalPaid = approved.reduce((sum, p) => sum + p.amount, 0);
      const remaining = servicePrice - totalPaid;
      if (remaining <= 0) {
        throw new BadRequestException('La cita ya está completamente pagada');
      }
      amount = remaining;
      amountInCents = Math.round(remaining * 100);
    }

    const reference = `kamerinos-${bookingId.slice(0, 8)}-${Date.now().toString(36)}`;
    const currency = 'COP';
    const publicKey = this.config.get<string>('WOMPI_PUBLIC_KEY') || 'pub_test_xxx';

    const signature = this.generateIntegritySignature(reference, amountInCents, currency);

    await this.paymentsRepo.create({
      booking: { connect: { id: bookingId } },
      user: { connect: { id: booking.userId } },
      amount,
      type,
      wompiReference: reference,
    } as any);

    return {
      publicKey,
      reference,
      amountInCents,
      currency,
      signature,
    };
  }

  validateWebhookSignature(
    transactionId: string,
    status: string,
    amountInCents: string,
    timestamp: string,
    checksum: string,
  ): boolean {
    const secret = this.config.get<string>('WOMPI_EVENTS_KEY') || 'events_test_xxx';
    const data = `${transactionId}${status}${amountInCents}${timestamp}${secret}`;
    const computed = crypto.createHash('sha256').update(data).digest('hex');
    return computed.toUpperCase() === checksum.toUpperCase();
  }

  async handleWebhook(body: any, rawChecksum: string) {
    const event = body.event;
    const data = body.data?.transaction;
    const timestamp = body.timestamp?.toString();
    const checksum = rawChecksum || body.signature?.checksum;

    if (!data || !timestamp || !checksum) {
      throw new BadRequestException('Payload de webhook inválido');
    }

    const isValid = this.validateWebhookSignature(
      data.id, data.status, data.amount_in_cents?.toString(), timestamp, checksum,
    );

    if (!isValid) {
      this.logger.warn('Firma de webhook inválida');
      throw new BadRequestException('Firma de webhook inválida');
    }

    if (event !== 'transaction.updated') return { received: true };

    const status = data.status;

    let payment: any;
    try {
      payment = await this.paymentsRepo.findByWompiId(data.id);
    } catch {
      this.logger.warn(`Pago no encontrado para wompiPaymentId: ${data.id}`);
      return { received: true };
    }

    if (status === 'APPROVED') {
      await this.paymentsRepo.update(payment.id, {
        status: 'APROBADO',
        wompiPaymentId: data.id,
        paidAt: new Date(),
      } as any);

      if (payment.type === 'ABONO') {
        await this.bookingsRepo.update(payment.bookingId, { status: 'CONFIRMADA' } as any);
      }

      const booking = await this.bookingsRepo.findById(payment.bookingId).catch(() => null);
      if (payment.type === 'ABONO') {
        this.metaCapi.sendEvent({
          eventName: 'Purchase',
          customData: {
            currency: 'COP',
            value: data.amount_in_cents ? data.amount_in_cents / 100 : undefined,
            contentName: (booking as any)?.service?.name,
            bookingId: payment.bookingId,
          },
        });
      }
    } else if (status === 'DECLINED' || status === 'ERROR' || status === 'VOIDED') {
      await this.paymentsRepo.update(payment.id, { status: 'RECHAZADO' } as any);
    }

    return { received: true };
  }

  async getPaymentStatus(bookingId: string) {
    const payments = await this.paymentsRepo.findApprovedByBookingId(bookingId);
    const booking = await this.bookingsRepo.findById(bookingId).catch(() => null);
    const servicePrice = booking ? Number((booking.service as any)?.price) : 0;
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      payments: payments.map((p) => ({
        id: p.id,
        type: p.type,
        status: p.status,
        amount: p.amount,
        paidAt: p.paidAt,
        wompiReference: p.wompiReference,
      })),
      total: servicePrice,
      paid: Math.round(totalPaid * 100) / 100,
      remaining: Math.round((servicePrice - totalPaid) * 100) / 100,
    };
  }
}
