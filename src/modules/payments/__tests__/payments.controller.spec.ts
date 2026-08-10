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
    it('should return payment config', async () => {
      service.initPayment.mockResolvedValue({ publicKey: 'pk', signature: 'sig', reference: 'ref', amountInCents: 5000, currency: 'COP' });
      const result = await controller.init({ bookingId: 'booking-1' });
      expect(result.publicKey).toBe('pk');
      expect(service.initPayment).toHaveBeenCalledWith('booking-1');
    });
  });

  describe('webhook', () => {
    it('should handle webhook events', async () => {
      service.handleWebhook.mockResolvedValue({ received: true });
      const result = await controller.webhook({ event: 'transaction.updated' }, 'checksum123');
      expect(result.received).toBe(true);
    });
  });
});
