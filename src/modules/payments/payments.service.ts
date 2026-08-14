import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { IPaymentsRepository, PaymentTransactionFilters } from '../../repositories/interfaces/payments.repository';
import { IBookingsRepository } from '../../repositories/interfaces/bookings.repository';
import { ICouponsRepository } from '../../repositories/interfaces/coupons.repository';
import { IProductsRepository } from '../../repositories/interfaces/products.repository';
import { IOrdersRepository } from '../../repositories/interfaces/orders.repository';
import { MetaCapiService } from '../meta/meta-capi.service';
import { EmailService } from '../../common/email/email.service';
import { BookingSyncService } from '../bookings/booking-sync.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private paymentsRepo: IPaymentsRepository,
    private bookingsRepo: IBookingsRepository,
    private couponsRepo: ICouponsRepository,
    private productsRepo: IProductsRepository,
    private ordersRepo: IOrdersRepository,
    private config: ConfigService,
    private metaCapi: MetaCapiService,
    private emailService: EmailService,
    private bookingSync: BookingSyncService,
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
      payment = await this.paymentsRepo.findByWompiReference(data.reference);
      if (!payment) {
        try { payment = await this.paymentsRepo.findByWompiId(data.id); } catch {}
      }
      if (!payment) {
        this.logger.warn(`Pago no encontrado para ref: ${data.reference} / id: ${data.id}`);
        return { received: true };
      }
    } catch { return { received: true }; }

    if (status === 'APPROVED') {
      if (payment.status === 'APROBADO') {
        this.logger.log(`Webhook duplicado para pago ${payment.id}, ignorando`);
        return { received: true };
      }

      await this.paymentsRepo.update(payment.id, {
        status: 'APROBADO',
        wompiPaymentId: data.id,
        paidAt: new Date(),
      } as any);

      if (payment.type === 'ABONO') {
        await this.bookingSync.confirmAndSync(payment.bookingId);
      }

      const booking = await this.bookingsRepo.findById(payment.bookingId).catch(() => null);
      if (booking) {
        this.metaCapi.sendEvent({
          eventName: 'Purchase',
          customData: {
            currency: 'COP',
            value: data.amount_in_cents ? data.amount_in_cents / 100 : undefined,
            contentName: (booking as any)?.service?.name,
            bookingId: payment.bookingId,
          },
        });

        const clientName = `${(booking as any)?.user?.firstName || ''} ${(booking as any)?.user?.lastName || ''}`.trim();
        const servicePrice = Number((booking as any)?.service?.price || 0);
        const depositPaid = Number(payment.amount || 0);
        const dateStr = new Date(booking.startTime).toLocaleDateString('es-CO', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        const timeStr = new Date(booking.startTime).toLocaleTimeString('es-CO', {
          hour: '2-digit', minute: '2-digit', hour12: true,
        });

        this.emailService.sendBookingReceipt({
          clientName: clientName || 'Cliente',
          clientEmail: (booking as any)?.user?.email || '',
          serviceName: (booking as any)?.service?.name || 'Servicio',
          date: dateStr,
          time: timeStr,
          depositAmount: depositPaid,
          remainingAmount: Math.round((servicePrice - depositPaid) * 100) / 100,
          bookingId: payment.bookingId,
          paymentReference: payment.wompiReference || data.reference || '',
        });
      }

      const metadata = (payment as any).metadata;
      if (!booking && metadata?.items) {
        const existingOrder = await this.ordersRepo.findByPaymentId(payment.id);
        if (existingOrder) {
          this.logger.log(`Orden ya existente para pago ${payment.id}, ignorando webhook duplicado`);
          return { received: true };
        }

        for (const item of metadata.items) {
          try {
            const product = await this.productsRepo.findById(item.productId).catch(() => null);
            if (product && product.stock > 0) {
              await this.productsRepo.update(item.productId, { stock: product.stock - item.quantity } as any);
            }
          } catch {}
        }
        const user = (payment as any).user;
        let orderId: string | undefined;
        try {
          const order = await this.ordersRepo.create({
            userId: payment.userId,
            total: Number(payment.amount || 0),
            status: 'CONFIRMADO' as any,
            shippingName: metadata.shippingName || (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Cliente' : 'Cliente'),
            shippingEmail: metadata.shippingEmail || user?.email || '',
            shippingPhone: metadata.shippingPhone || '',
            shippingAddress: metadata.shippingAddress || 'Pendiente',
            shippingCity: metadata.shippingCity || 'Pendiente',
            shippingNotes: metadata.shippingNotes || null,
            paymentId: payment.id,
            items: metadata.items.map((i: any) => ({
              productId: i.productId,
              name: i.name,
              price: i.price,
              quantity: i.quantity,
            })),
          } as any);
          orderId = order.id;
        } catch (err: any) {
          this.logger.error('No se pudo crear la orden automáticamente', {
            error: err?.message,
            code: err?.code,
            meta: err?.meta,
            paymentId: payment.id,
          });
        }
        if (metadata.couponId && payment.userId) {
          try {
            await this.couponsRepo.consumeCoupon(metadata.couponId, payment.userId, orderId);
          } catch (err: any) {
            this.logger.warn(`No se pudo registrar el uso del cupón ${metadata.couponId}: ${err?.message}`);
          }
        }
        if (user?.email || metadata.shippingEmail) {
          this.emailService.sendPaymentReceipt({
            clientName: metadata.shippingName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Cliente',
            clientEmail: metadata.shippingEmail || user?.email || '',
            serviceName: `Compra — ${metadata.items.length} producto(s)`,
            amount: Number(payment.amount || 0),
            paymentReference: payment.wompiReference || '',
            bookingId: payment.id,
          });
        }
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

  async initCartPayment(userId: string, dto: { items: { productId: string; name: string; price: number; quantity: number }[]; couponCode?: string; couponId?: string; shippingName?: string; shippingEmail?: string; shippingPhone?: string; shippingAddress?: string; shippingCity?: string; shippingNotes?: string }) {
    let subtotal = dto.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    let discount = 0;

    if (dto.couponId) {
      try {
        const coupon = await this.couponsRepo.findById(dto.couponId);
        const withinLimits =
          coupon.isActive &&
          new Date(coupon.expiresAt) > new Date() &&
          (coupon.maxUses === null || coupon.usedCount < coupon.maxUses);
        const usage = await this.couponsRepo.findUsage(dto.couponId, userId);
        if (withinLimits && !usage) {
          discount = Math.round(subtotal * Number(coupon.discount) * 100) / 100;
        }
      } catch {}
    }

    const total = Math.round((subtotal - discount) * 100) / 100;
    if (total <= 0) throw new BadRequestException('El monto total debe ser mayor a 0');

    const reference = `kamerinos-cart-${userId.slice(0, 8)}-${Date.now().toString(36)}`;
    const amountInCents = Math.round(total * 100);
    const currency = 'COP';
    const publicKey = this.config.get<string>('WOMPI_PUBLIC_KEY') || 'pub_test_xxx';
    const signature = this.generateIntegritySignature(reference, amountInCents, currency);

    await this.paymentsRepo.create({
      user: { connect: { id: userId } },
      amount: total,
      type: 'SALDO',
      wompiReference: reference,
      metadata: { items: JSON.parse(JSON.stringify(dto.items)), couponId: dto.couponId || null, couponCode: dto.couponCode || null, shippingName: dto.shippingName || null, shippingEmail: dto.shippingEmail || null, shippingPhone: dto.shippingPhone || null, shippingAddress: dto.shippingAddress || null, shippingCity: dto.shippingCity || null, shippingNotes: dto.shippingNotes || null },
    } as any);

    return { publicKey, reference, amountInCents, currency, signature };
  }

  async findAllTransactions(filters?: PaymentTransactionFilters) {
    return this.paymentsRepo.findAllTransactions(filters);
  }

  async manualPayment(bookingId: string, paymentMethod: string) {
    const booking = await this.bookingsRepo.findById(bookingId);
    if (booking.status !== 'CONFIRMADA' && booking.status !== 'PENDIENTE_PAGO') {
      throw new BadRequestException('Solo citas pendientes o confirmadas pueden recibir pago manual');
    }

    const servicePrice = Number((booking.service as any).price);
    const approved = await this.paymentsRepo.findApprovedByBookingId(bookingId);
    const totalPaid = approved.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.round((servicePrice - totalPaid) * 100) / 100;

    if (remaining <= 0) {
      throw new BadRequestException('La cita ya está completamente pagada');
    }

    await this.paymentsRepo.create({
      booking: { connect: { id: bookingId } },
      user: { connect: { id: booking.userId } },
      amount: remaining,
      type: 'SALDO',
      status: 'APROBADO',
      paymentMethod: paymentMethod as any,
      paidAt: new Date(),
    } as any);

    if (booking.status === 'PENDIENTE_PAGO') {
      await this.bookingSync.confirmAndSync(bookingId);
    }

    return { success: true, amount: remaining, totalPaid: Math.round((totalPaid + remaining) * 100) / 100 };
  }

  async getRevenue(month: string) {
    const total = await this.paymentsRepo.findRevenue(month);
    return { total };
  }
}
