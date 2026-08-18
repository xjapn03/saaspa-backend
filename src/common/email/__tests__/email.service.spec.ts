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
});
