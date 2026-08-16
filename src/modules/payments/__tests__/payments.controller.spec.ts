import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PaymentsController } from '../payments.controller';
import { PaymentsService } from '../payments.service';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let service: DeepMockProxy<PaymentsService>;

  beforeEach(async () => {
    service = mockDeep<PaymentsService>();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: service }],
    }).compile();
    controller = module.get<PaymentsController>(PaymentsController);
  });

  describe('init', () => {
    it('should return payment config with ABONO by default', async () => {
      service.initPayment.mockResolvedValue({ publicKey: 'pk', signature: 'sig', reference: 'ref', amountInCents: 5000, currency: 'COP' });
      const result = await controller.init({ bookingId: 'booking-1' });
      expect(result.publicKey).toBe('pk');
      expect(service.initPayment).toHaveBeenCalledWith('booking-1', 'ABONO', {
        payFull: false,
        fbc: undefined,
        fbp: undefined,
        eventId: undefined,
      });
    });

    it('should pass SALDO type when specified', async () => {
      service.initPayment.mockResolvedValue({ publicKey: 'pk', signature: 'sig', reference: 'ref', amountInCents: 3000, currency: 'COP' });
      const result = await controller.init({ bookingId: 'booking-1', type: 'SALDO' });
      expect(result.publicKey).toBe('pk');
      expect(service.initPayment).toHaveBeenCalledWith('booking-1', 'SALDO', {
        payFull: false,
        fbc: undefined,
        fbp: undefined,
        eventId: undefined,
      });
    });

    it('should pass payFull and attribution fields when provided', async () => {
      service.initPayment.mockResolvedValue({ publicKey: 'pk', signature: 'sig', reference: 'ref', amountInCents: 10000, currency: 'COP' });
      await controller.init({ bookingId: 'booking-1', type: 'ABONO', payFull: true, fbc: 'fb.1.abc', fbp: 'fb.2.def', eventId: 'evt-1' });
      expect(service.initPayment).toHaveBeenCalledWith('booking-1', 'ABONO', {
        payFull: true,
        fbc: 'fb.1.abc',
        fbp: 'fb.2.def',
        eventId: 'evt-1',
      });
    });
  });

  describe('webhook', () => {
    it('should handle webhook events', async () => {
      service.handleWebhook.mockResolvedValue({ received: true });
      const result = await controller.webhook({ event: 'transaction.updated' }, 'checksum123');
      expect(result.received).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return payment status', async () => {
      service.getPaymentStatus.mockResolvedValue({ payments: [], total: 100000, paid: 30000, remaining: 70000 });
      const result = await controller.getStatus('booking-1');
      expect(result.remaining).toBe(70000);
      expect(service.getPaymentStatus).toHaveBeenCalledWith('booking-1');
    });
  });

  describe('initCart', () => {
    it('should delegate to service with userId and dto', async () => {
      service.initCartPayment.mockResolvedValue({ publicKey: 'pk', reference: 'ref', amountInCents: 5000, currency: 'COP', signature: 'sig' });
      const dto = { items: [{ productId: 'prod-1', name: 'A', price: 1000, quantity: 2 }] };
      const result = await controller.initCart('user-1', dto);
      expect(result.publicKey).toBe('pk');
      expect(service.initCartPayment).toHaveBeenCalledWith('user-1', dto);
    });
  });
});
