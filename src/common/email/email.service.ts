import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

export interface BookingReceiptData {
  clientName: string;
  clientEmail: string;
  serviceName: string;
  date: string;
  time: string;
  depositAmount: number;
  remainingAmount: number;
  bookingId: string;
  paymentReference: string;
}

export interface PaymentReceiptData {
  clientName: string;
  clientEmail: string;
  serviceName: string;
  amount: number;
  paymentReference: string;
  bookingId: string;
}

export interface WelcomeEmailData {
  clientName: string;
  clientEmail: string;
  verifyUrl: string;
}

export interface OrderItemData {
  name: string;
  price: number;
  quantity: number;
}

export interface OrderReceiptData {
  clientName: string;
  clientEmail: string;
  orderId: string;
  items: OrderItemData[];
  total: number;
  shippingAddress: string;
  shippingCity: string;
  paymentReference: string;
  subtotal?: number;
  discountAmount?: number | null;
  couponCode?: string | null;
  couponDiscountPercent?: number | null;
}

export interface OrderStatusData {
  clientName: string;
  clientEmail: string;
  orderId: string;
  status: string;
  items: OrderItemData[];
  total: number;
}

/**
 * Internal alert of a chat conversation that needs a person (J-05 / ADR 0013).
 * It carries what a person needs to take over: the reason, the conversation and
 * the message that triggered it.
 */
export interface HandoffNotificationData {
  conversationId: string;
  reason: string | null;
  message: string | null;
  at: Date;
  turnId?: string | null;
  userId?: string | null;
}

/**
 * A payment that arrived after the payment window closed (H-01). The money is
 * in but the booking has no confirmed slot, so a person of the salon has to
 * assign one or refund. `reason` says which of the two situations happened.
 */
export interface LatePaymentData {
  clientName: string;
  clientEmail: string;
  clientPhone?: string | null;
  serviceName: string;
  amount: number;
  paymentReference: string;
  bookingId: string;
  /** `NEEDS_SLOT`: window closed, slot free. `NEEDS_REVIEW`: slot already taken. */
  reason: 'NEEDS_SLOT' | 'NEEDS_REVIEW';
  /** The slot the client had asked for; formatted by this service. */
  startTime: Date;
}

const BRAND = '#a0522d';
const INK = '#3d2e28';
const MUTED = '#8b7a6b';
const BORDER = '#e8dcd0';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly from = { email: 'info@sandrapinzonsaludybelleza.com.co', name: 'Kamerinos SPA' };
  private readonly replyTo: string;
  private readonly adminNotifyEmail: string;
  /** Inbox that receives the chat handoff alerts; falls back to the staff inbox. */
  private readonly salonNotificationEmail: string;
  private readonly frontendUrl: string;
  private readonly isEnabled: boolean;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('SENDGRID_API_KEY');
    this.isEnabled = !!apiKey;
    this.replyTo = this.config.get<string>('SENDGRID_REPLY_TO') || 'kamerinosg@gmail.com';
    this.adminNotifyEmail = this.config.get<string>('ADMIN_NOTIFY_EMAIL') || 'kamerinosg@gmail.com';
    this.salonNotificationEmail =
      this.config.get<string>('SALON_NOTIFICATION_EMAIL') || this.adminNotifyEmail;
    this.frontendUrl = this.config.get<string>('FRONTEND_URL') || this.config.get<string>('CORS_ORIGIN')?.split(',')[0] || 'https://kamerinos.sandrapinzonsaludybelleza.com.co';
    if (apiKey) {
      sgMail.setApiKey(apiKey);
    } else {
      this.logger.warn('SENDGRID_API_KEY not configured — emails will be logged to console');
    }
  }

  private formatPrice(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  }

  private buildOrderSummaryRows(data: OrderReceiptData): string {
    const hasDiscount = (data.discountAmount ?? 0) > 0;
    if (!hasDiscount) return '';

    const subtotal = data.subtotal ?? data.total + (data.discountAmount ?? 0);
    const couponLabel = [
      data.couponCode,
      data.couponDiscountPercent ? `${data.couponDiscountPercent}%` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    return `
      <tr>
        <td style="padding: 8px 0; color: ${MUTED};">Subtotal</td>
        <td style="padding: 8px 0; text-align: right;">${this.formatPrice(subtotal)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #16a34a;">Descuento${couponLabel ? ` (${couponLabel})` : ''}</td>
        <td style="padding: 8px 0; text-align: right; color: #16a34a;">-${this.formatPrice(data.discountAmount ?? 0)}</td>
      </tr>`;
  }

  private renderLayout(inner: string): string {
    return `
      <div style="font-family: Georgia, 'Times New Roman', serif; background-color: #faf6f1; padding: 32px 16px;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid ${BORDER};">
          <div style="background-color: ${BRAND}; padding: 28px 32px; text-align: center;">
            <img src="${this.frontendUrl}/LogokamerinosYellow.png" alt="Kamerinos SPA" style="max-height: 60px; margin-bottom: 8px;" />
            <p style="margin: 0; color: #f3e3d3; font-size: 13px;">Centro de estética y bienestar · Bogotá</p>
          </div>
          <div style="padding: 32px; color: ${INK};">
            ${inner}
          </div>
          <div style="padding: 20px 32px; background-color: #fdf9f4; border-top: 1px solid ${BORDER}; color: ${MUTED}; font-size: 12px; line-height: 1.6;">
            <p style="margin: 0;">Kamerinos SPA — Teusaquillo, Bogotá</p>
            <p style="margin: 4px 0 0;">+57 304 1338567 · kamerinosg@gmail.com</p>
          </div>
        </div>
      </div>
    `;
  }

  async sendBookingReceipt(data: BookingReceiptData): Promise<void> {
    const inner = `
      <h1 style="color: ${BRAND}; font-size: 20px; margin: 0 0 8px;">Confirmación de tu cita</h1>
      <p style="font-size: 15px; line-height: 1.6;">¡Gracias por agendar con nosotros, <strong>${data.clientName}</strong>!</p>
      <hr style="border: none; border-top: 1px solid ${BORDER}; margin: 20px 0;" />
      <h2 style="font-size: 16px; color: ${BRAND}; margin: 0 0 12px;">Detalles de tu cita</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: ${MUTED}; width: 140px;">Servicio</td><td>${data.serviceName}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Fecha</td><td>${data.date}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Hora</td><td>${data.time}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Referencia</td><td>${data.paymentReference}</td></tr>
      </table>
      <hr style="border: none; border-top: 1px solid ${BORDER}; margin: 20px 0;" />
      <h2 style="font-size: 16px; color: ${BRAND}; margin: 0 0 12px;">Resumen de pago</h2>
      <p style="margin: 6px 0;"><strong>Abono pagado:</strong> ${this.formatPrice(data.depositAmount)}</p>
      <p style="margin: 6px 0;"><strong>Saldo restante:</strong> ${this.formatPrice(data.remainingAmount)}</p>
      <p style="font-size: 13px; color: ${MUTED}; margin: 16px 0 0;">Puedes pagar el saldo restante el día de tu cita o antes desde tu panel de cliente.</p>
    `;
    await this.send(data.clientEmail, 'Confirmación de tu cita — Kamerinos SPA', this.renderLayout(inner), 'booking-receipt', data.bookingId);
  }

  async sendPaymentReceipt(data: PaymentReceiptData): Promise<void> {
    const inner = `
      <h1 style="color: ${BRAND}; font-size: 20px; margin: 0 0 8px;">Comprobante de pago</h1>
      <p style="font-size: 15px; line-height: 1.6;">¡Pago recibido, <strong>${data.clientName}</strong>!</p>
      <hr style="border: none; border-top: 1px solid ${BORDER}; margin: 20px 0;" />
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: ${MUTED}; width: 140px;">Concepto</td><td>${data.serviceName}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Monto</td><td>${this.formatPrice(data.amount)}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Referencia</td><td>${data.paymentReference}</td></tr>
      </table>
    `;
    await this.send(data.clientEmail, 'Comprobante de pago — Kamerinos SPA', this.renderLayout(inner), 'payment-receipt', data.bookingId);
  }

  async sendWelcomeEmail(data: WelcomeEmailData): Promise<void> {
    const inner = `
      <h1 style="color: ${BRAND}; font-size: 20px; margin: 0 0 8px;">¡Bienvenida a Kamerinos SPA!</h1>
      <p style="font-size: 15px; line-height: 1.6;">Hola <strong>${data.clientName}</strong>, nos alegra tenerte con nosotros.</p>
      <p style="font-size: 14px; line-height: 1.6; color: ${INK};">Para empezar a disfrutar de nuestros servicios, confirma tu cuenta con el siguiente botón:</p>
      <p style="margin: 24px 0;">
        <a href="${data.verifyUrl}" style="background-color: ${BRAND}; color: #ffffff; padding: 12px 28px; border-radius: 24px; text-decoration: none; font-weight: bold; display: inline-block;">Verificar mi cuenta</a>
      </p>
      <p style="font-size: 12px; color: ${MUTED}; margin: 16px 0 0;">Este enlace expira en 1 hora. Si no creaste esta cuenta, ignora este mensaje.</p>
    `;
    await this.send(data.clientEmail, 'Verifica tu cuenta — Kamerinos SPA', this.renderLayout(inner), 'welcome-verify', `verify-${Date.now()}`);
  }

  async sendPasswordReset(email: string, name: string, resetUrl: string): Promise<void> {
    const inner = `
      <h1 style="color: ${BRAND}; font-size: 20px; margin: 0 0 8px;">Restablecer contraseña</h1>
      <p style="font-size: 15px; line-height: 1.6;">Hola${name ? ` <strong>${name}</strong>` : ''},</p>
      <p style="font-size: 14px; line-height: 1.6;">Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para continuar:</p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="background-color: ${BRAND}; color: #ffffff; padding: 12px 28px; border-radius: 24px; text-decoration: none; font-weight: bold; display: inline-block;">Restablecer contraseña</a>
      </p>
      <p style="font-size: 12px; color: ${MUTED}; margin: 16px 0 0;">Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este mensaje.</p>
    `;
    await this.send(email, 'Restablece tu contraseña — Kamerinos SPA', this.renderLayout(inner), 'password-reset', `reset-${Date.now()}`);
  }

  async sendEmailChangeCode(to: string, name: string, code: string): Promise<void> {
    const inner = `
      <h1 style="color: ${BRAND}; font-size: 20px; margin: 0 0 8px;">Cambio de correo electrónico</h1>
      <p style="font-size: 15px; line-height: 1.6;">Hola${name ? ` <strong>${name}</strong>` : ''},</p>
      <p style="font-size: 14px; line-height: 1.6;">Usa el siguiente código para confirmar tu nuevo correo:</p>
      <p style="margin: 24px 0; text-align: center;">
        <span style="background-color: ${BORDER}; color: ${INK}; font-size: 28px; letter-spacing: 8px; font-weight: bold; padding: 12px 24px; border-radius: 12px; display: inline-block;">${code}</span>
      </p>
      <p style="font-size: 12px; color: ${MUTED}; margin: 16px 0 0;">El código expira en 15 minutos. Si no solicitaste este cambio, ignora este mensaje.</p>
    `;
    await this.send(to, 'Tu código de cambio de correo — Kamerinos SPA', this.renderLayout(inner), 'email-change-code', `email-change-${Date.now()}`);
  }

  async sendOrderReceipt(data: OrderReceiptData): Promise<void> {
    const rows = data.items
      .map(
        (i) => `
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid ${BORDER};">${i.name} <span style="color: ${MUTED};">× ${i.quantity}</span></td>
            <td style="padding: 8px 0; border-bottom: 1px solid ${BORDER}; text-align: right;">${this.formatPrice(i.price * i.quantity)}</td>
          </tr>`,
      )
      .join('');

    const inner = `
      <h1 style="color: ${BRAND}; font-size: 20px; margin: 0 0 8px;">Pedido confirmado</h1>
      <p style="font-size: 15px; line-height: 1.6;">¡Gracias por tu compra, <strong>${data.clientName}</strong>!</p>
      <p style="font-size: 13px; color: ${MUTED};">Pedido #${data.orderId} · Referencia ${data.paymentReference}</p>
      <hr style="border: none; border-top: 1px solid ${BORDER}; margin: 20px 0;" />
      <h2 style="font-size: 16px; color: ${BRAND}; margin: 0 0 12px;">Resumen de tu pedido</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        ${rows}
        ${this.buildOrderSummaryRows(data)}
        <tr>
          <td style="padding: 12px 0; font-weight: bold;">Total</td>
          <td style="padding: 12px 0; text-align: right; font-weight: bold;">${this.formatPrice(data.total)}</td>
        </tr>
      </table>
      <p style="font-size: 13px; color: ${MUTED}; margin: 16px 0 0;">Envío: ${data.shippingAddress}, ${data.shippingCity}</p>
    `;
    await this.send(data.clientEmail, 'Tu pedido fue confirmado — Kamerinos SPA', this.renderLayout(inner), 'order-receipt', data.orderId);
  }

  async sendOrderStatus(data: OrderStatusData): Promise<void> {
    const rows = data.items
      .map(
        (i) => `
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid ${BORDER};">${i.name} <span style="color: ${MUTED};">× ${i.quantity}</span></td>
            <td style="padding: 8px 0; border-bottom: 1px solid ${BORDER}; text-align: right;">${this.formatPrice(i.price * i.quantity)}</td>
          </tr>`,
      )
      .join('');

    const inner = `
      <h1 style="color: ${BRAND}; font-size: 20px; margin: 0 0 8px;">Actualización de tu pedido</h1>
      <p style="font-size: 15px; line-height: 1.6;">Hola <strong>${data.clientName}</strong>, tu pedido <strong>#${data.orderId}</strong> ahora está: <strong>${data.status}</strong>.</p>
      <hr style="border: none; border-top: 1px solid ${BORDER}; margin: 20px 0;" />
      <h2 style="font-size: 16px; color: ${BRAND}; margin: 0 0 12px;">Detalle</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        ${rows}
        <tr>
          <td style="padding: 12px 0; font-weight: bold;">Total</td>
          <td style="padding: 12px 0; text-align: right; font-weight: bold;">${this.formatPrice(data.total)}</td>
        </tr>
      </table>
    `;
    await this.send(data.clientEmail, `Tu pedido está ${data.status} — Kamerinos SPA`, this.renderLayout(inner), 'order-status', data.orderId);
  }

  async sendAdminBookingNotification(data: BookingReceiptData & { clientPhone?: string }): Promise<void> {
    const inner = `
      <h1 style="color: ${BRAND}; font-size: 20px; margin: 0 0 8px;">Nueva cita confirmada</h1>
      <p style="font-size: 14px; color: ${MUTED}; margin: 0 0 16px;">Notificación interna — Kamerinos SPA</p>
      <hr style="border: none; border-top: 1px solid ${BORDER}; margin: 16px 0;" />
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: ${MUTED}; width: 150px;">Cliente</td><td><strong>${data.clientName}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Email</td><td>${data.clientEmail || '—'}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Teléfono</td><td>${data.clientPhone || '—'}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Servicio</td><td>${data.serviceName}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Fecha</td><td>${data.date} · ${data.time}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Abono</td><td>${this.formatPrice(data.depositAmount)}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Saldo</td><td>${this.formatPrice(data.remainingAmount)}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Cita</td><td>#${data.bookingId}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Referencia</td><td>${data.paymentReference || '—'}</td></tr>
      </table>
      <p style="margin: 24px 0; text-align: center;">
        <a href="${this.frontendUrl}/dashboard/citas" style="background-color: ${BRAND}; color: #ffffff; padding: 12px 28px; border-radius: 24px; text-decoration: none; font-weight: bold; display: inline-block;">Ver Cita en Dashboard</a>
      </p>
      <p style="font-size: 12px; color: ${MUTED}; margin: 16px 0 0;">Recuerda registrar el saldo pendiente cuando se pague. Este correo es soporte/historial interno.</p>
    `;
    await this.send(this.adminNotifyEmail, 'Nueva cita confirmada — Kamerinos SPA', this.renderLayout(inner), 'admin-booking', data.bookingId);
  }

  async sendAdminOrderNotification(data: OrderReceiptData & { clientPhone?: string }): Promise<void> {
    const rows = data.items
      .map(
        (i) => `
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid ${BORDER};">${i.name} <span style="color: ${MUTED};">× ${i.quantity}</span></td>
            <td style="padding: 8px 0; border-bottom: 1px solid ${BORDER}; text-align: right;">${this.formatPrice(i.price * i.quantity)}</td>
          </tr>`,
      )
      .join('');

    const inner = `
      <h1 style="color: ${BRAND}; font-size: 20px; margin: 0 0 8px;">Nuevo pedido confirmado</h1>
      <p style="font-size: 14px; color: ${MUTED}; margin: 0 0 16px;">Notificación interna — Kamerinos SPA</p>
      <hr style="border: none; border-top: 1px solid ${BORDER}; margin: 16px 0;" />
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: ${MUTED}; width: 150px;">Cliente</td><td><strong>${data.clientName}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Email</td><td>${data.clientEmail || '—'}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Teléfono</td><td>${data.clientPhone || '—'}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Envío</td><td>${data.shippingAddress}, ${data.shippingCity}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Pedido</td><td>#${data.orderId}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Referencia</td><td>${data.paymentReference || '—'}</td></tr>
      </table>
      <h2 style="font-size: 16px; color: ${BRAND}; margin: 16px 0 8px;">Detalle</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        ${rows}
        ${this.buildOrderSummaryRows(data)}
        <tr><td style="padding: 12px 0; font-weight: bold;">Total</td><td style="padding: 12px 0; text-align: right; font-weight: bold;">${this.formatPrice(data.total)}</td></tr>
      </table>
      <p style="margin: 24px 0; text-align: center;">
        <a href="${this.frontendUrl}/dashboard/pedidos" style="background-color: ${BRAND}; color: #ffffff; padding: 12px 28px; border-radius: 24px; text-decoration: none; font-weight: bold; display: inline-block;">Ver Pedido en Dashboard</a>
      </p>
      <p style="font-size: 12px; color: ${MUTED}; margin: 16px 0 0;">Recuerda gestionar el despacho. Este correo es soporte/historial interno.</p>
    `;
    await this.send(this.adminNotifyEmail, 'Nuevo pedido confirmado — Kamerinos SPA', this.renderLayout(inner), 'admin-order', data.orderId);
  }

  async sendAdminOrderStatusNotification(data: OrderStatusData): Promise<void> {
    const rows = data.items
      .map(
        (i) => `
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid ${BORDER};">${i.name} <span style="color: ${MUTED};">× ${i.quantity}</span></td>
            <td style="padding: 8px 0; border-bottom: 1px solid ${BORDER}; text-align: right;">${this.formatPrice(i.price * i.quantity)}</td>
          </tr>`,
      )
      .join('');

    const inner = `
      <h1 style="color: ${BRAND}; font-size: 20px; margin: 0 0 8px;">Pedido #${data.orderId} → ${data.status}</h1>
      <p style="font-size: 14px; color: ${MUTED}; margin: 0 0 16px;">Notificación interna — Kamerinos SPA</p>
      <p style="font-size: 15px; line-height: 1.6;">El pedido de <strong>${data.clientName}</strong> cambió a <strong>${data.status}</strong>.</p>
      <hr style="border: none; border-top: 1px solid ${BORDER}; margin: 16px 0;" />
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        ${rows}
        <tr><td style="padding: 12px 0; font-weight: bold;">Total</td><td style="padding: 12px 0; text-align: right; font-weight: bold;">${this.formatPrice(data.total)}</td></tr>
      </table>
    `;
    await this.send(this.adminNotifyEmail, `Pedido #${data.orderId} → ${data.status} — Kamerinos SPA`, this.renderLayout(inner), 'admin-order-status', data.orderId);
  }

  /**
   * Alerts the salon that a conversation needs a person (J-05 / ADR 0013). The
   * message comes from the client and the reason from saaspa-IA, so both are
   * escaped before they reach the HTML.
   */
  async sendHandoffNotification(data: HandoffNotificationData): Promise<void> {
    const conversation = this.escapeHtml(data.conversationId);
    const inner = `
      <h1 style="color: ${BRAND}; font-size: 20px; margin: 0 0 8px;">Una clienta necesita atención humana</h1>
      <p style="font-size: 14px; color: ${MUTED}; margin: 0 0 16px;">Notificación interna del chat — Kamerinos SPA</p>
      <hr style="border: none; border-top: 1px solid ${BORDER}; margin: 16px 0;" />
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: ${MUTED}; width: 150px;">Motivo</td><td><strong>${this.escapeHtml(data.reason) || '—'}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Conversación</td><td>${conversation}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Cuándo</td><td>${this.formatInstant(data.at)}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Turno</td><td>${this.escapeHtml(data.turnId) || '—'}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Clienta</td><td>${data.userId ? `registrada (${this.escapeHtml(data.userId)})` : 'anónima (widget)'}</td></tr>
      </table>
      <p style="font-size: 14px; color: ${INK}; margin: 20px 0 8px;"><strong>Mensaje que activó el handoff</strong></p>
      <blockquote style="margin: 0; padding: 12px 16px; border-left: 3px solid ${BRAND}; background: #faf6f2; font-size: 14px; color: ${INK};">${this.escapeHtml(data.message) || '(sin texto)'}</blockquote>
      <p style="font-size: 14px; color: ${INK}; margin: 24px 0 8px;"><strong>Cómo cerrarlo</strong></p>
      <p style="font-size: 13px; color: ${MUTED}; margin: 0;">
        Mientras el handoff siga activo el bot no responde en esta conversación. Cuando la clienta ya esté atendida,
        ciérralo desde el dashboard con <code>PATCH /api/chat/conversations/${conversation}/handoff</code> y
        <code>{"action":"close"}</code>: el bot vuelve a responder. Si hay que devolverla a una persona, usa
        <code>{"action":"reopen"}</code>.
      </p>
    `;

    await this.send(
      this.salonNotificationEmail,
      'Una clienta necesita atención humana — Kamerinos SPA',
      this.renderLayout(inner),
      'chat-handoff',
      data.conversationId,
    );
  }

  /**
   * Tells the client that a late payment was received (H-01). It deliberately
   * does not promise a confirmed slot: her money is safe and a person of the
   * salon will contact her.
   */
  async sendLatePaymentClientNotice(data: LatePaymentData): Promise<void> {
    const inner = `
      <h1 style="color: ${BRAND}; font-size: 20px; margin: 0 0 8px;">Recibimos tu pago</h1>
      <p style="font-size: 15px; line-height: 1.6;">Hola <strong>${this.escapeHtml(data.clientName)}</strong>, tu pago llegó correctamente y ya está registrado a tu nombre.</p>
      <hr style="border: none; border-top: 1px solid ${BORDER}; margin: 20px 0;" />
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: ${MUTED}; width: 150px;">Servicio</td><td>${this.escapeHtml(data.serviceName)}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Franja solicitada</td><td>${this.formatInstant(data.startTime)}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Monto</td><td>${this.formatPrice(data.amount)}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Referencia</td><td>${this.escapeHtml(data.paymentReference)}</td></tr>
      </table>
      <p style="font-size: 14px; line-height: 1.6; margin: 20px 0 0;">Esa franja se liberó antes de que confirmáramos tu cita, así que <strong>una persona del salón te contactará</strong> para asignarte un horario o gestionar la devolución. No necesitas hacer nada más.</p>
    `;
    await this.send(
      data.clientEmail,
      'Recibimos tu pago — Kamerinos SPA',
      this.renderLayout(inner),
      'late-payment-client',
      data.bookingId,
    );
  }

  /**
   * Internal alert so the salon resolves a late payment: assign a slot or refund
   * (H-01). Without this, a payment that arrived after the window would sit in
   * silence.
   */
  async sendAdminLatePaymentNotification(data: LatePaymentData): Promise<void> {
    const situation =
      data.reason === 'NEEDS_REVIEW'
        ? 'La cita no se pudo confirmar (la franja ya la tomó otra cita, o la cita ya no estaba activa): hay que reubicar a la clienta o reembolsar.'
        : 'La franja se liberó al vencer la ventana de pago: hay que asignarle un horario nuevo o reembolsar.';
    const inner = `
      <h1 style="color: ${BRAND}; font-size: 20px; margin: 0 0 8px;">Pago recibido fuera de la ventana</h1>
      <p style="font-size: 14px; color: ${MUTED}; margin: 0 0 16px;">Notificación interna — Kamerinos SPA</p>
      <hr style="border: none; border-top: 1px solid ${BORDER}; margin: 16px 0;" />
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: ${MUTED}; width: 150px;">Situación</td><td><strong>${situation}</strong></td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Clienta</td><td>${this.escapeHtml(data.clientName)}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Email</td><td>${this.escapeHtml(data.clientEmail) || '—'}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Teléfono</td><td>${this.escapeHtml(data.clientPhone) || '—'}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Servicio</td><td>${this.escapeHtml(data.serviceName)}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Franja pedida</td><td>${this.formatInstant(data.startTime)}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Monto</td><td>${this.formatPrice(data.amount)}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Referencia</td><td>${this.escapeHtml(data.paymentReference)}</td></tr>
        <tr><td style="padding: 6px 0; color: ${MUTED};">Cita</td><td>${data.bookingId}</td></tr>
      </table>
      <p style="font-size: 13px; color: ${MUTED}; margin: 20px 0 0;">La cita quedó como <code>PAGO_TARDE</code>: el pago está aprobado y no ocupa franja. Reagéndala desde el dashboard para colocarla, o cancélala y gestiona la devolución con Wompi.</p>
    `;
    await this.send(
      this.salonNotificationEmail,
      'Pago recibido fuera de la ventana — Kamerinos SPA',
      this.renderLayout(inner),
      'late-payment-admin',
      data.bookingId,
    );
  }

  /** Escapes text that comes from outside (client message, reason, ids). */
  private escapeHtml(value: string | null | undefined): string {
    if (!value) return '';
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatInstant(date: Date): string {
    const timeZone = this.config.get<string>('TENANT_TIMEZONE') || 'America/Bogota';
    return date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone });
  }

  private async send(to: string, subject: string, html: string, template: string, id: string): Promise<void> {
    if (!to) {
      this.logger.warn(`[EMAIL] ${template}: destinatario vacío, omitiendo envío`);
      return;
    }
    if (!this.isEnabled) {
      this.logger.log(`[EMAIL] ${template} to=${to} id=${id} subject="${subject}" — SENDGRID_API_KEY not configured`);
      return;
    }

    try {
      await sgMail.send({
        to,
        from: this.from,
        replyTo: this.replyTo,
        subject,
        html,
      });
      this.logger.log(`[EMAIL] ${template} sent to=${to} id=${id}`);
    } catch (error) {
      this.logger.error(`[EMAIL] Failed to send ${template} to=${to}: ${(error as Error).message}`);
    }
  }
}
