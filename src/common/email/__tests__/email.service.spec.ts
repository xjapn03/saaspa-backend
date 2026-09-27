import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email.service';

describe('EmailService', () => {
  let service: EmailService;

  const bookingData = {
    clientName: 'Maria Gomez',
    clientEmail: 'maria@example.com',
    serviceName: 'Facial',
    date: '15 de agosto de 2026',
    time: '10:00 a.m.',
    depositAmount: 30000,
    remainingAmount: 70000,
    bookingId: 'booking-1',
    paymentReference: 'ref-abc123',
  };

  const paymentData = {
    clientName: 'Maria Gomez',
    clientEmail: 'maria@example.com',
    serviceName: 'Facial',
    amount: 70000,
    paymentReference: 'ref-xyz789',
    bookingId: 'booking-1',
  };

  describe('without API key', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          {
            provide: ConfigService,
            useValue: { get: () => undefined },
          },
        ],
      }).compile();
      service = module.get<EmailService>(EmailService);
    });

    it('should log booking receipt to console without sending', async () => {
      await expect(service.sendBookingReceipt(bookingData)).resolves.toBeUndefined();
    });

    it('should log payment receipt to console without sending', async () => {
      await expect(service.sendPaymentReceipt(paymentData)).resolves.toBeUndefined();
    });

    it('should log admin booking notification without throwing', async () => {
      await expect(service.sendAdminBookingNotification(bookingData)).resolves.toBeUndefined();
    });

    it('should log admin order notification without throwing', async () => {
      const orderData = {
        clientName: 'Maria Gomez',
        clientEmail: 'maria@example.com',
        orderId: 'order-1',
        items: [{ name: 'Crema', price: 50000, quantity: 1 }],
        total: 50000,
        shippingAddress: 'Calle 1',
        shippingCity: 'Bogotá',
        paymentReference: 'ref-abc',
      };
      await expect(service.sendAdminOrderNotification(orderData)).resolves.toBeUndefined();
    });

    it('should render coupon discount rows in order receipt', async () => {
      const sendSpy = jest.spyOn(service as any, 'send').mockResolvedValue(undefined);
      const orderData = {
        clientName: 'Maria Gomez',
        clientEmail: 'maria@example.com',
        orderId: 'order-1',
        items: [{ name: 'Crema', price: 50000, quantity: 1 }],
        total: 45000,
        subtotal: 50000,
        discountAmount: 5000,
        couponCode: 'DESC10',
        couponDiscountPercent: 10,
        shippingAddress: 'Calle 1',
        shippingCity: 'Bogotá',
        paymentReference: 'ref-abc',
      };
      await service.sendOrderReceipt(orderData);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const html = sendSpy.mock.calls[0][2];
      expect(html).toContain('Subtotal');
      expect(html).toContain('Descuento (DESC10 · 10%)');
      expect(html).toMatch(/-\$[\s]?5\.000/);
      expect(html).toMatch(/\$[\s]?50\.000/);
      expect(html).toMatch(/\$[\s]?45\.000/);
    });

    it('should render coupon discount rows in admin order notification', async () => {
      const sendSpy = jest.spyOn(service as any, 'send').mockResolvedValue(undefined);
      const orderData = {
        clientName: 'Maria Gomez',
        clientEmail: 'maria@example.com',
        orderId: 'order-1',
        items: [{ name: 'Crema', price: 50000, quantity: 1 }],
        total: 45000,
        subtotal: 50000,
        discountAmount: 5000,
        couponCode: 'DESC10',
        couponDiscountPercent: 10,
        shippingAddress: 'Calle 1',
        shippingCity: 'Bogotá',
        paymentReference: 'ref-abc',
      };
      await service.sendAdminOrderNotification(orderData);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const html = sendSpy.mock.calls[0][2];
      expect(html).toContain('Descuento (DESC10 · 10%)');
      expect(html).toMatch(/-\$[\s]?5\.000/);
    });

    it('should not render discount rows when there is no coupon', async () => {
      const sendSpy = jest.spyOn(service as any, 'send').mockResolvedValue(undefined);
      const orderData = {
        clientName: 'Maria Gomez',
        clientEmail: 'maria@example.com',
        orderId: 'order-1',
        items: [{ name: 'Crema', price: 50000, quantity: 1 }],
        total: 50000,
        shippingAddress: 'Calle 1',
        shippingCity: 'Bogotá',
        paymentReference: 'ref-abc',
      };
      await service.sendOrderReceipt(orderData);
      const html = sendSpy.mock.calls[0][2];
      expect(html).not.toContain('Descuento');
    });

    it('should log admin order status notification without throwing', async () => {
      const statusData = {
        clientName: 'Maria Gomez',
        clientEmail: 'maria@example.com',
        orderId: 'order-1',
        status: 'CONFIRMADO',
        items: [{ name: 'Crema', price: 50000, quantity: 1 }],
        total: 50000,
      };
      await expect(service.sendAdminOrderStatusNotification(statusData)).resolves.toBeUndefined();
    });
  });

  describe('with API key (mocked)', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          {
            provide: ConfigService,
            useValue: { get: () => 'SG.fake-key' },
          },
        ],
      }).compile();
      service = module.get<EmailService>(EmailService);
    });

    it('should be marked as enabled', () => {
      expect(service).toBeDefined();
    });

    it('should attempt to send booking receipt (may fail without real key)', async () => {
      await expect(service.sendBookingReceipt(bookingData)).resolves.toBeUndefined();
    });
  });

  describe('chat handoff notification (J-05 / ADR 0013)', () => {
    const handoff = {
      conversationId: 'a'.repeat(32),
      reason: 'HEALTH_TOPIC',
      message: 'Tengo una alergia <b>fuerte</b>',
      at: new Date('2026-09-27T12:00:00.000Z'),
      turnId: 'turn-1',
      userId: 'user-1',
    };

    const build = async (env: Record<string, string | undefined>) => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
        ],
      }).compile();
      return module.get<EmailService>(EmailService);
    };

    const sendCalls = (send: jest.SpyInstance) =>
      send.mock.calls[0] as [string, string, string, string, string];

    it('sends the alert to SALON_NOTIFICATION_EMAIL with what a person needs', async () => {
      const emailService = await build({ SALON_NOTIFICATION_EMAIL: 'salon@test.com' });
      const send = jest.spyOn(emailService as any, 'send').mockResolvedValue(undefined);

      await emailService.sendHandoffNotification(handoff);

      const [to, subject, html, template, id] = sendCalls(send);
      expect(to).toBe('salon@test.com');
      expect(subject).toContain('atención humana');
      expect(template).toBe('chat-handoff');
      expect(id).toBe(handoff.conversationId);
      expect(html).toContain('HEALTH_TOPIC');
      expect(html).toContain(handoff.conversationId);
      expect(html).toContain('turn-1');
      expect(html).toContain('registrada (user-1)');
      // How to close it, so a person can undo the latch without the dashboard.
      expect(html).toContain(`/api/chat/conversations/${handoff.conversationId}/handoff`);
      expect(html).toContain('"action":"close"');
      expect(html).toContain('"action":"reopen"');
    });

    it('escapes the client message before it reaches the HTML', async () => {
      const emailService = await build({ SALON_NOTIFICATION_EMAIL: 'salon@test.com' });
      const send = jest.spyOn(emailService as any, 'send').mockResolvedValue(undefined);

      await emailService.sendHandoffNotification(handoff);

      const [, , html] = sendCalls(send);
      expect(html).toContain('&lt;b&gt;fuerte&lt;/b&gt;');
      expect(html).not.toContain('<b>fuerte</b>');
    });

    it('falls back to the staff inbox when SALON_NOTIFICATION_EMAIL is missing', async () => {
      const emailService = await build({ ADMIN_NOTIFY_EMAIL: 'staff@test.com' });
      const send = jest.spyOn(emailService as any, 'send').mockResolvedValue(undefined);

      await emailService.sendHandoffNotification({
        ...handoff,
        reason: null,
        message: null,
        userId: null,
      });

      const [to, , html] = sendCalls(send);
      expect(to).toBe('staff@test.com');
      expect(html).toContain('(sin texto)');
      expect(html).toContain('anónima (widget)');
    });
  });

  describe('late payment notification (H-01)', () => {
    const latePayment = {
      clientName: 'Maria Gomez',
      clientEmail: 'maria@example.com',
      clientPhone: '3001234567',
      serviceName: 'Facial',
      amount: 30000,
      paymentReference: 'ref-late',
      bookingId: 'booking-1',
      reason: 'NEEDS_SLOT' as const,
      startTime: new Date('2026-10-01T15:00:00.000Z'),
    };

    const build = async (env: Record<string, string | undefined>) => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
        ],
      }).compile();
      return module.get<EmailService>(EmailService);
    };

    const sendCalls = (send: jest.SpyInstance) =>
      send.mock.calls[0] as [string, string, string, string, string];

    it('tells the clienta her money arrived without promising a confirmed slot', async () => {
      const emailService = await build({});
      const send = jest.spyOn(emailService as any, 'send').mockResolvedValue(undefined);

      await emailService.sendLatePaymentClientNotice(latePayment);

      const [to, subject, html, template, id] = sendCalls(send);
      expect(to).toBe('maria@example.com');
      expect(subject).toContain('Recibimos tu pago');
      expect(template).toBe('late-payment-client');
      expect(id).toBe('booking-1');
      expect(html).toContain('una persona del salón te contactará');
      expect(html).not.toContain('Confirmación de tu cita');
    });

    it('alerts the salon with the reason and how to resolve it', async () => {
      const emailService = await build({ SALON_NOTIFICATION_EMAIL: 'salon@test.com' });
      const send = jest.spyOn(emailService as any, 'send').mockResolvedValue(undefined);

      await emailService.sendAdminLatePaymentNotification({
        ...latePayment,
        reason: 'NEEDS_REVIEW',
      });

      const [to, , html, template] = sendCalls(send);
      expect(to).toBe('salon@test.com');
      expect(template).toBe('late-payment-admin');
      expect(html).toContain('otra cita');
      expect(html).toContain('PAGO_TARDE');
      expect(html).toContain('3001234567');
    });

    it('does not throw without an API key', async () => {
      const emailService = await build({});
      await expect(emailService.sendLatePaymentClientNotice(latePayment)).resolves.toBeUndefined();
      await expect(
        emailService.sendAdminLatePaymentNotification(latePayment),
      ).resolves.toBeUndefined();
    });
  });
});
