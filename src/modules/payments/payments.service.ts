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

  async initPayment(bookingId: string) {
    const booking = await this.bookingsRepo.findById(bookingId);
    if (booking.status !== 'PENDIENTE_PAGO') {
      throw new BadRequestException('La cita no está pendiente de pago');
    }

    const reference = `kamerinos-${bookingId.slice(0, 8)}-${Date.now().toString(36)}`;
    const amountInCents = Math.round((booking.service as any).price * 100 * 0.3);
    const currency = 'COP';
    const publicKey = this.config.get<string>('WOMPI_PUBLIC_KEY') || 'pub_test_xxx';

    const signature = this.generateIntegritySignature(reference, amountInCents, currency);

    await this.paymentsRepo.create({
      booking: { connect: { id: bookingId } },
      user: { connect: { id: booking.userId } },
      amount: booking.service ? (booking.service as any).price * 0.3 : 0,
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

    const reference = data.reference;
    const status = data.status;

    const payment = await this.paymentsRepo.findByWompiId(data.id).catch(() => null);
    if (!payment) {
      this.logger.warn(`Pago no encontrado para referencia: ${reference}`);
      return { received: true };
    }

    if (status === 'APPROVED') {
      await this.paymentsRepo.update(payment.id, {
        status: 'APROBADO',
        wompiPaymentId: data.id,
        paidAt: new Date(),
      } as any);

      await this.bookingsRepo.update(payment.bookingId, { status: 'CONFIRMADA' } as any);

      const booking = await this.bookingsRepo.findById(payment.bookingId).catch(() => null);
      this.metaCapi.sendEvent({
        eventName: 'Purchase',
        customData: {
          currency: 'COP',
          value: data.amount_in_cents ? data.amount_in_cents / 100 : undefined,
          contentName: (booking as any)?.service?.name,
          bookingId: payment.bookingId,
        },
      });
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
