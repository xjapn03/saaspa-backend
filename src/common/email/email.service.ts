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

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly from = { email: 'info@kamerinosspa.com', name: 'Kamerinos SPA' };
  private readonly isEnabled: boolean;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('SENDGRID_API_KEY');
    this.isEnabled = !!apiKey;
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

  async sendBookingReceipt(data: BookingReceiptData): Promise<void> {
    const subject = 'Kamerinos SPA — Confirmación de tu cita';
    const html = `
      <div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; color: #3d2e28;">
        <h1 style="color: #a0522d; font-size: 24px; margin-bottom: 8px;">Kamerinos SPA</h1>
        <p style="font-size: 16px;">¡Gracias por agendar con nosotros, <strong>${data.clientName}</strong>!</p>
        <hr style="border: 1px solid #e8dcd0; margin: 20px 0;" />
        <h2 style="font-size: 18px; color: #a0522d;">Detalles de tu cita</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 6px 0;"><strong>Servicio:</strong></td><td>${data.serviceName}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Fecha:</strong></td><td>${data.date}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Hora:</strong></td><td>${data.time}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Referencia:</strong></td><td>${data.paymentReference}</td></tr>
        </table>
        <hr style="border: 1px solid #e8dcd0; margin: 20px 0;" />
        <h2 style="font-size: 18px; color: #a0522d;">Resumen de pago</h2>
        <p><strong>Abono pagado:</strong> ${this.formatPrice(data.depositAmount)}</p>
        <p><strong>Saldo restante:</strong> ${this.formatPrice(data.remainingAmount)}</p>
        <p style="font-size: 13px; color: #8b7a6b;">Puedes pagar el saldo restante el día de tu cita o antes desde tu panel de cliente.</p>
        <hr style="border: 1px solid #e8dcd0; margin: 20px 0;" />
        <p style="font-size: 13px; color: #8b7a6b;">Kamerinos SPA — Usaquén, Bogotá</p>
      </div>
    `;

    await this.send(data.clientEmail, subject, html, 'booking-receipt', data.bookingId);
  }

  async sendPaymentReceipt(data: PaymentReceiptData): Promise<void> {
    const subject = 'Kamerinos SPA — Comprobante de pago';
    const html = `
      <div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; color: #3d2e28;">
        <h1 style="color: #a0522d; font-size: 24px; margin-bottom: 8px;">Kamerinos SPA</h1>
        <p style="font-size: 16px;">¡Pago recibido, <strong>${data.clientName}</strong>!</p>
        <hr style="border: 1px solid #e8dcd0; margin: 20px 0;" />
        <h2 style="font-size: 18px; color: #a0522d;">Comprobante de pago</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 6px 0;"><strong>Servicio:</strong></td><td>${data.serviceName}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Monto:</strong></td><td>${this.formatPrice(data.amount)}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Referencia:</strong></td><td>${data.paymentReference}</td></tr>
          <tr><td style="padding: 6px 0;"><strong>Cita:</strong></td><td>${data.bookingId}</td></tr>
        </table>
        <hr style="border: 1px solid #e8dcd0; margin: 20px 0;" />
        <p style="font-size: 13px; color: #8b7a6b;">Kamerinos SPA — Usaquén, Bogotá</p>
      </div>
    `;

    await this.send(data.clientEmail, subject, html, 'payment-receipt', data.bookingId);
  }

  private async send(to: string, subject: string, html: string, template: string, id: string): Promise<void> {
    if (!this.isEnabled) {
      this.logger.log(`[EMAIL] ${template} to=${to} id=${id} subject="${subject}" — SENDGRID_API_KEY not configured`);
      return;
    }

    try {
      await sgMail.send({
        to,
        from: this.from,
        subject,
        html,
      });
      this.logger.log(`[EMAIL] ${template} sent to=${to} id=${id}`);
    } catch (error) {
      this.logger.error(`[EMAIL] Failed to send ${template} to=${to}: ${(error as Error).message}`);
    }
  }

  async sendPasswordReset(email: string, name: string, resetUrl: string): Promise<void> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:2rem">
        <h2 style="color:#9C6B4B">Kamerinos SPA</h2>
        <p>Hola${name ? ` ${name}` : ''},</p>
        <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para continuar:</p>
        <p style="margin:2rem 0">
          <a href="${resetUrl}" style="background-color:#9C6B4B;color:white;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:bold">Restablecer contraseña</a>
        </p>
        <p style="color:#888;font-size:0.85rem">Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este mensaje.</p>
      </div>
    `;

    await this.send(email, 'Restablece tu contraseña — Kamerinos SPA', html, 'password-reset', `reset-${Date.now()}`);
  }
}
