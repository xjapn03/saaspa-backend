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
      expect(service.initPayment).toHaveBeenCalledWith('booking-1', 'ABONO');
    });

    it('should pass SALDO type when specified', async () => {
      service.initPayment.mockResolvedValue({ publicKey: 'pk', signature: 'sig', reference: 'ref', amountInCents: 3000, currency: 'COP' });
      const result = await controller.init({ bookingId: 'booking-1', type: 'SALDO' });
      expect(result.publicKey).toBe('pk');
      expect(service.initPayment).toHaveBeenCalledWith('booking-1', 'SALDO');
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
});
