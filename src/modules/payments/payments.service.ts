import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import {
  IPaymentsRepository,
  PaymentTransactionFilters,
} from '../../repositories/interfaces/payments.repository';
import { IBookingsRepository } from '../../repositories/interfaces/bookings.repository';
import { ICouponsRepository } from '../../repositories/interfaces/coupons.repository';
import { IProductsRepository } from '../../repositories/interfaces/products.repository';
import { IOrdersRepository } from '../../repositories/interfaces/orders.repository';
import { MetaCapiService, hashCapiValue, hashCapiPhone } from '../meta/meta-capi.service';
import { EmailService, LatePaymentData } from '../../common/email/email.service';
import { AuditService } from '../../common/audit/audit.service';
import { BookingSyncService, PaymentConfirmationOutcome } from '../bookings/booking-sync.service';
import { IPaymentProvider } from './providers/payment-provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private paymentsRepo: IPaymentsRepository,
    private bookingsRepo: IBookingsRepository,
    private couponsRepo: ICouponsRepository,
    private productsRepo: IProductsRepository,
    private ordersRepo: IOrdersRepository,
    private paymentProvider: IPaymentProvider,
    private metaCapi: MetaCapiService,
    private emailService: EmailService,
    private bookingSync: BookingSyncService,
    private audit: AuditService,
  ) {}

  async initPayment(
    bookingId: string,
    type: 'ABONO' | 'SALDO' = 'ABONO',
    options?: {
      payFull?: boolean;
      fbc?: string;
      fbp?: string;
      eventId?: string;
      clientIpAddress?: string;
      clientUserAgent?: string;
    },
  ) {
    const booking = await this.bookingsRepo.findById(bookingId);
    const servicePrice = Number((booking.service as any).price);
    let amountInCents: number;
    let amount: number;

    if (type === 'ABONO') {
      if (booking.status !== 'PENDIENTE_PAGO') {
        throw new BadRequestException('La cita no está pendiente de pago');
      }
      amount = options?.payFull ? servicePrice : servicePrice * 0.3;
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
    const paymentConfig = this.paymentProvider.createPaymentIntent({
      reference,
      amountInCents,
      currency,
    });

    await this.paymentsRepo.create({
      booking: { connect: { id: bookingId } },
      user: { connect: { id: booking.userId } },
      amount,
      type,
      wompiReference: reference,
      metadata: {
        fbc: options?.fbc || null,
        fbp: options?.fbp || null,
        eventId: options?.eventId || null,
        clientIpAddress: options?.clientIpAddress || null,
        clientUserAgent: options?.clientUserAgent || null,
        payFull: options?.payFull || false,
      },
    } as any);

    return paymentConfig;
  }

  async handleWebhook(body: any, rawChecksum: string) {
    const parsed = this.paymentProvider.parseWebhook(body, rawChecksum);

    if (!parsed.ok) {
      throw new BadRequestException('Payload de webhook inválido');
    }

    const event = parsed.event;

    const isValid = this.paymentProvider.verifyWebhookSignature(event);

    if (!isValid) {
      this.logger.warn('Firma de webhook inválida');
      throw new BadRequestException('Firma de webhook inválida');
    }

    if (event.eventName !== 'transaction.updated') return { received: true };

    const status = event.status;
    const transactionId = event.transactionId;
    const reference = event.reference;
    const amountInCents = event.amountInCents;

    let payment: any;
    try {
      payment = await this.paymentsRepo.findByWompiReference(reference);
      if (!payment) {
        try {
          payment = await this.paymentsRepo.findByWompiId(transactionId);
        } catch {}
      }
      if (!payment) {
        this.logger.warn(`Pago no encontrado para ref: ${reference} / id: ${transactionId}`);
        return { received: true };
      }
    } catch {
      return { received: true };
    }

    if (status === 'APPROVED') {
      const paymentMetadata = (payment as any).metadata || {};
      const isAbono = payment.type === 'ABONO';

      // The ABONO path records how the booking was resolved (`paymentOutcome`),
      // so a retried webhook can tell "already handled" from "the first attempt
      // died halfway" (H-01). SALDO and cart keep the old duplicate shortcut.
      const alreadyHandled =
        payment.status === 'APROBADO' && (!isAbono || paymentMetadata.paymentOutcome !== undefined);
      if (alreadyHandled) {
        this.logger.log(`Webhook duplicado para pago ${payment.id}, ignorando`);
        return { received: true };
      }

      // Decide the booking BEFORE writing the payment: a late payment must not be
      // recorded as approved and then fail to find a slot (H-01).
      let outcome: PaymentConfirmationOutcome | null = null;
      let latePaymentBooking: any = null;
      if (isAbono) {
        const result = await this.bookingSync.confirmOnPayment(payment.bookingId, {
          fbc: paymentMetadata.fbc,
          fbp: paymentMetadata.fbp,
        });
        outcome = result.outcome;
        latePaymentBooking = result.booking;
      }

      const latePaymentReason: LatePaymentData['reason'] | null =
        outcome === 'NEEDS_SLOT' ? 'NEEDS_SLOT' : outcome === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : null;

      await this.paymentsRepo.update(payment.id, {
        status: 'APROBADO',
        wompiPaymentId: transactionId,
        paidAt: new Date(),
        metadata: {
          ...paymentMetadata,
          ...(isAbono
            ? {
                paymentOutcome: outcome,
                ...(latePaymentReason
                  ? { reviewRequired: true, reviewReason: latePaymentReason }
                  : {}),
              }
            : {}),
        },
      } as any);

      if (latePaymentReason && latePaymentBooking) {
        await this.handleLatePayment(payment, latePaymentBooking, latePaymentReason);
        return { received: true };
      }

      const booking = await this.bookingsRepo.findById(payment.bookingId).catch(() => null);
      if (booking) {
        if (payment.type === 'ABONO') {
          this.metaCapi.sendEvent({
            eventName: 'Purchase',
            eventId: (payment as any).metadata?.eventId || `purchase-${payment.id}`,
            userData: {
              em: (booking as any)?.user?.email
                ? hashCapiValue((booking as any).user.email)
                : undefined,
              ph: (booking as any)?.user?.phone
                ? hashCapiPhone((booking as any).user.phone)
                : undefined,
              fbc: (payment as any).metadata?.fbc || undefined,
              fbp: (payment as any).metadata?.fbp || undefined,
              clientIpAddress: (payment as any).metadata?.clientIpAddress || undefined,
              clientUserAgent: (payment as any).metadata?.clientUserAgent || undefined,
            },
            customData: {
              currency: 'COP',
              value: amountInCents ? Number(amountInCents) / 100 : undefined,
              contentName: (booking as any)?.service?.name,
              bookingId: payment.bookingId,
            },
          });
        }

        const clientName =
          `${(booking as any)?.user?.firstName || ''} ${(booking as any)?.user?.lastName || ''}`.trim();
        const servicePrice = Number((booking as any)?.service?.price || 0);
        const depositPaid = Number(payment.amount || 0);
        const dateStr = new Date(booking.startTime).toLocaleDateString('es-CO', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        const timeStr = new Date(booking.startTime).toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
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
          paymentReference: payment.wompiReference || reference || '',
        });

        this.emailService.sendAdminBookingNotification({
          clientName: clientName || 'Cliente',
          clientEmail: (booking as any)?.user?.email || '',
          clientPhone: (booking as any)?.user?.phone || undefined,
          serviceName: (booking as any)?.service?.name || 'Servicio',
          date: dateStr,
          time: timeStr,
          depositAmount: depositPaid,
          remainingAmount: Math.round((servicePrice - depositPaid) * 100) / 100,
          bookingId: payment.bookingId,
          paymentReference: payment.wompiReference || reference || '',
        });
      }

      const metadata = (payment as any).metadata;
      if (!booking && metadata?.items) {
        const existingOrder = await this.ordersRepo.findByPaymentId(payment.id);
        if (existingOrder) {
          this.logger.log(
            `Orden ya existente para pago ${payment.id}, ignorando webhook duplicado`,
          );
          return { received: true };
        }

        for (const item of metadata.items) {
          try {
            const product = await this.productsRepo.findById(item.productId).catch(() => null);
            if (product && product.stock > 0) {
              await this.productsRepo.update(item.productId, {
                stock: product.stock - item.quantity,
              } as any);
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
            shippingName:
              metadata.shippingName ||
              (user
                ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Cliente'
                : 'Cliente'),
            shippingEmail: metadata.shippingEmail || user?.email || '',
            shippingPhone: metadata.shippingPhone || '',
            shippingAddress: metadata.shippingAddress || 'Pendiente',
            shippingCity: metadata.shippingCity || 'Pendiente',
            shippingState: metadata.shippingState || null,
            shippingNit: metadata.shippingNit || null,
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
            this.logger.warn(
              `No se pudo registrar el uso del cupón ${metadata.couponId}: ${err?.message}`,
            );
          }
        }
        if (user?.email || metadata.shippingEmail) {
          const subtotal =
            Math.round(
              metadata.items.reduce((s: number, i: any) => s + i.price * i.quantity, 0) * 100,
            ) / 100;
          const discountAmount = Math.round((subtotal - Number(payment.amount || 0)) * 100) / 100;
          const couponDiscountPercent =
            typeof metadata.couponDiscount === 'number'
              ? Math.round(metadata.couponDiscount * 100)
              : null;
          const orderReceiptData = {
            clientName:
              metadata.shippingName ||
              `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
              'Cliente',
            clientEmail: metadata.shippingEmail || user?.email || '',
            orderId: orderId || payment.id,
            items: metadata.items.map((i: any) => ({
              name: i.name,
              price: i.price,
              quantity: i.quantity,
            })),
            total: Number(payment.amount || 0),
            subtotal,
            discountAmount: discountAmount > 0 ? discountAmount : null,
            couponCode: metadata.couponCode || null,
            couponDiscountPercent,
            shippingAddress: metadata.shippingAddress || 'Pendiente',
            shippingCity: metadata.shippingCity || 'Pendiente',
            paymentReference: payment.wompiReference || '',
          };
          this.emailService.sendOrderReceipt(orderReceiptData);
          this.emailService.sendAdminOrderNotification({
            ...orderReceiptData,
            clientPhone: metadata.shippingPhone || user?.phone || undefined,
          });
        }

        this.metaCapi.sendEvent({
          eventName: 'Purchase',
          eventId: metadata.eventId || `purchase-${payment.id}`,
          userData: {
            em:
              user?.email || metadata.shippingEmail
                ? hashCapiValue(user?.email || metadata.shippingEmail)
                : undefined,
            ph:
              user?.phone || metadata.shippingPhone
                ? hashCapiPhone(user?.phone || metadata.shippingPhone)
                : undefined,
            fbc: metadata.fbc || undefined,
            fbp: metadata.fbp || undefined,
            clientIpAddress: metadata.clientIpAddress || undefined,
            clientUserAgent: metadata.clientUserAgent || undefined,
          },
          customData: {
            currency: 'COP',
            value: Number(payment.amount || 0),
            contentName: 'Carrito',
            contentCategory: 'Tienda',
            contentIds: metadata.items.map((i: any) => i.productId),
          },
        });
      }
    } else if (status === 'DECLINED' || status === 'ERROR' || status === 'VOIDED') {
      await this.paymentsRepo.update(payment.id, { status: 'RECHAZADO' } as any);
    }

    return { received: true };
  }

  /**
   * A payment that arrived when the booking could not be confirmed (H-01): the
   * money is in, the slot is not. Tells the client, alerts the salon and records
   * an audit entry, so the case can never pass unnoticed.
   */
  private async handleLatePayment(
    payment: any,
    booking: any,
    reason: LatePaymentData['reason'],
  ): Promise<void> {
    const clientName =
      `${booking?.user?.firstName || ''} ${booking?.user?.lastName || ''}`.trim() || 'Cliente';
    const data: LatePaymentData = {
      clientName,
      clientEmail: booking?.user?.email || '',
      clientPhone: booking?.user?.phone || null,
      serviceName: booking?.service?.name || 'Servicio',
      amount: Number(payment.amount || 0),
      paymentReference: payment.wompiReference || '',
      bookingId: payment.bookingId,
      reason,
      startTime: new Date(booking.startTime),
    };

    this.logger.warn(
      `Pago ${payment.id} aprobado sin franja (${reason}) para la cita ${payment.bookingId}`,
    );

    // The clienta must know her money arrived even if the slot did not.
    this.emailService.sendLatePaymentClientNotice(data);
    this.emailService.sendAdminLatePaymentNotification(data);

    await this.audit.record({
      action: reason === 'NEEDS_SLOT' ? 'PAYMENT_LATE_WINDOW_CLOSED' : 'PAYMENT_LATE_SLOT_TAKEN',
      entity: 'payments',
      entityId: payment.id,
    });
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

  async initCartPayment(
    userId: string,
    dto: {
      items: { productId: string; name: string; price: number; quantity: number }[];
      couponCode?: string;
      couponId?: string;
      shippingName?: string;
      shippingEmail?: string;
      shippingPhone?: string;
      shippingAddress?: string;
      shippingCity?: string;
      shippingNotes?: string;
      shippingState?: string;
      shippingNit?: string;
      fbc?: string;
      fbp?: string;
      eventId?: string;
      clientUserAgent?: string;
    },
    options?: { clientIpAddress?: string },
  ) {
    const subtotal = dto.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    let discount = 0;
    let couponDiscount: number | null = null;

    if (dto.couponId) {
      try {
        const coupon = await this.couponsRepo.findById(dto.couponId);
        const withinLimits =
          coupon.isActive &&
          new Date(coupon.expiresAt) > new Date() &&
          (coupon.maxUses === null || coupon.usedCount < coupon.maxUses);
        const usage = await this.couponsRepo.findUsage(dto.couponId, userId);
        if (withinLimits && !usage) {
          couponDiscount = Number(coupon.discount);
          discount = Math.round(subtotal * couponDiscount * 100) / 100;
        }
      } catch {}
    }

    const total = Math.round((subtotal - discount) * 100) / 100;
    if (total <= 0) throw new BadRequestException('El monto total debe ser mayor a 0');

    const reference = `kamerinos-cart-${userId.slice(0, 8)}-${Date.now().toString(36)}`;
    const amountInCents = Math.round(total * 100);
    const currency = 'COP';
    const paymentConfig = this.paymentProvider.createPaymentIntent({
      reference,
      amountInCents,
      currency,
    });

    await this.paymentsRepo.create({
      user: { connect: { id: userId } },
      amount: total,
      type: 'SALDO',
      wompiReference: reference,
      metadata: {
        items: JSON.parse(JSON.stringify(dto.items)),
        couponId: dto.couponId || null,
        couponCode: dto.couponCode || null,
        subtotal: Math.round(subtotal * 100) / 100,
        discount: Math.round(discount * 100) / 100,
        couponDiscount,
        fbc: dto.fbc || null,
        fbp: dto.fbp || null,
        eventId: dto.eventId || null,
        clientIpAddress: options?.clientIpAddress || null,
        clientUserAgent: dto.clientUserAgent || null,
        shippingName: dto.shippingName || null,
        shippingEmail: dto.shippingEmail || null,
        shippingPhone: dto.shippingPhone || null,
        shippingAddress: dto.shippingAddress || null,
        shippingCity: dto.shippingCity || null,
        shippingNotes: dto.shippingNotes || null,
        shippingState: dto.shippingState || null,
        shippingNit: dto.shippingNit || null,
      },
    } as any);

    return paymentConfig;
  }

  async findAllTransactions(filters?: PaymentTransactionFilters) {
    return this.paymentsRepo.findAllTransactions(filters);
  }

  async manualPayment(bookingId: string, paymentMethod: string) {
    const booking = await this.bookingsRepo.findById(bookingId);
    if (booking.status !== 'CONFIRMADA' && booking.status !== 'PENDIENTE_PAGO') {
      throw new BadRequestException(
        'Solo citas pendientes o confirmadas pueden recibir pago manual',
      );
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

    let confirmation: PaymentConfirmationOutcome = 'CONFIRMED';
    if (booking.status === 'PENDIENTE_PAGO') {
      // Shared with the webhook: a manual payment on a slot that is no longer
      // free must not produce a second CONFIRMADA booking either (H-01).
      const result = await this.bookingSync.confirmOnPayment(bookingId);
      confirmation = result.outcome;
    }

    return {
      success: true,
      amount: remaining,
      totalPaid: Math.round((totalPaid + remaining) * 100) / 100,
      confirmation,
    };
  }

  async getRevenue(month: string) {
    const total = await this.paymentsRepo.findRevenue(month);
    return { total };
  }
}
