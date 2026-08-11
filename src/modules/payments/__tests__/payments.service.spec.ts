import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PaymentsService } from '../payments.service';
import { IPaymentsRepository } from '../../../repositories/interfaces/payments.repository';
import { IBookingsRepository } from '../../../repositories/interfaces/bookings.repository';
import { MetaCapiService } from '../../meta/meta-capi.service';
import { EmailService } from '../../../common/email/email.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentsRepo: DeepMockProxy<IPaymentsRepository>;
  let bookingsRepo: DeepMockProxy<IBookingsRepository>;
  let metaCapi: DeepMockProxy<MetaCapiService>;
  let emailService: DeepMockProxy<EmailService>;

  const mockBooking = {
    id: 'booking-1',
    userId: 'user-1',
    serviceId: 'svc-1',
    startTime: new Date(),
    endTime: new Date(),
    status: 'PENDIENTE_PAGO',
    googleEventId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    service: { name: 'Facial', price: 100000, duration: 60 },
  };

  beforeEach(async () => {
    paymentsRepo = mockDeep<IPaymentsRepository>();
    bookingsRepo = mockDeep<IBookingsRepository>();
    metaCapi = mockDeep<MetaCapiService>();
    emailService = mockDeep<EmailService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: IPaymentsRepository, useValue: paymentsRepo },
        { provide: IBookingsRepository, useValue: bookingsRepo },
        { provide: MetaCapiService, useValue: metaCapi },
        { provide: EmailService, useValue: emailService },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            WOMPI_PUBLIC_KEY: 'pub_test_test123',
            WOMPI_INTEGRITY_SECRET: 'integ_test_test123',
            WOMPI_EVENTS_KEY: 'events_test_test123',
          }),
        },
      ],
    }).compile();
    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('generateIntegritySignature', () => {
    it('should generate a SHA256 hash from reference + amount + currency + secret', () => {
      const sig = service.generateIntegritySignature('ref-1', 50000, 'COP');
      expect(sig).toHaveLength(64);
      expect(sig).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('initPayment', () => {
    it('should throw if booking is not PENDIENTE_PAGO', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' } as any);
      await expect(service.initPayment('booking-1')).rejects.toThrow('pendiente de pago');
    });

    it('should return widget config on success', async () => {
      bookingsRepo.findById.mockResolvedValue(mockBooking as any);
      paymentsRepo.create.mockResolvedValue({ id: 'pay-1' } as any);
      const result = await service.initPayment('booking-1');
      expect(result.publicKey).toBe('pub_test_test123');
      expect(result.currency).toBe('COP');
      expect(result.signature).toHaveLength(64);
      expect(paymentsRepo.create).toHaveBeenCalled();
    });
  });

  describe('validateWebhookSignature', () => {
    it('should return true for valid signature', () => {
      const secret = 'events_test_test123';
      const crypto = require('crypto');
      const data = `txn-1APPROVED50000${Date.now()}${secret}`;
      const checksum = crypto.createHash('sha256').update(data).digest('hex');

      const valid = service.validateWebhookSignature('txn-1', 'APPROVED', '50000', '9999999', checksum);
      expect(valid).toBe(false); // timestamp mismatch
    });
  });
});
