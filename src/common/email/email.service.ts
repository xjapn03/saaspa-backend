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
}

export interface OrderStatusData {
  clientName: string;
  clientEmail: string;
  orderId: string;
  status: string;
  items: OrderItemData[];
  total: number;
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
  private readonly isEnabled: boolean;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('SENDGRID_API_KEY');
    this.isEnabled = !!apiKey;
    this.replyTo = this.config.get<string>('SENDGRID_REPLY_TO') || 'kamerinosg@gmail.com';
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

  private renderLayout(inner: string): string {
    return `
      <div style="font-family: Georgia, 'Times New Roman', serif; background-color: #faf6f1; padding: 32px 16px;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid ${BORDER};">
          <div style="background-color: ${BRAND}; padding: 28px 32px;">
            <p style="margin: 0; color: #ffffff; font-size: 26px; letter-spacing: 0.5px;">Kamerinos SPA</p>
            <p style="margin: 6px 0 0; color: #f3e3d3; font-size: 13px;">Centro de estética y bienestar · Bogotá</p>
          </div>
          <div style="padding: 32px; color: ${INK};">
            ${inner}
          </div>
          <div style="padding: 20px 32px; background-color: #fdf9f4; border-top: 1px solid ${BORDER}; color: ${MUTED}; font-size: 12px; line-height: 1.6;">
            <p style="margin: 0;">Kamerinos SPA — Usaquén, Bogotá</p>
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
