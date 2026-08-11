import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PaymentsService } from '../payments.service';
import { IPaymentsRepository } from '../../../repositories/interfaces/payments.repository';
import { IBookingsRepository } from '../../../repositories/interfaces/bookings.repository';
import { ICouponsRepository } from '../../../repositories/interfaces/coupons.repository';
import { IProductsRepository } from '../../../repositories/interfaces/products.repository';
import { MetaCapiService } from '../../meta/meta-capi.service';
import { EmailService } from '../../../common/email/email.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentsRepo: DeepMockProxy<IPaymentsRepository>;
  let bookingsRepo: DeepMockProxy<IBookingsRepository>;
  let couponsRepo: DeepMockProxy<ICouponsRepository>;
  let productsRepo: DeepMockProxy<IProductsRepository>;
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

  const mockConfirmedBooking = {
    ...mockBooking,
    status: 'CONFIRMADA',
  };

  const mockApprovedPayment = {
    id: 'pay-1',
    bookingId: 'booking-1',
    userId: 'user-1',
    amount: 30000,
    type: 'ABONO',
    status: 'APROBADO',
    wompiPaymentId: 'wompi-1',
    wompiReference: 'ref-1',
    paidAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    paymentsRepo = mockDeep<IPaymentsRepository>();
    bookingsRepo = mockDeep<IBookingsRepository>();
    couponsRepo = mockDeep<ICouponsRepository>();
    productsRepo = mockDeep<IProductsRepository>();
    metaCapi = mockDeep<MetaCapiService>();
    emailService = mockDeep<EmailService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: IPaymentsRepository, useValue: paymentsRepo },
        { provide: IBookingsRepository, useValue: bookingsRepo },
        { provide: ICouponsRepository, useValue: couponsRepo },
        { provide: IProductsRepository, useValue: productsRepo },
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

  describe('initPayment — ABONO', () => {
    it('should throw if booking is not PENDIENTE_PAGO', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' } as any);
      await expect(service.initPayment('booking-1', 'ABONO')).rejects.toThrow('pendiente de pago');
    });

    it('should return widget config for 30% deposit', async () => {
      bookingsRepo.findById.mockResolvedValue(mockBooking as any);
      paymentsRepo.create.mockResolvedValue({ id: 'pay-1' } as any);

      const result = await service.initPayment('booking-1', 'ABONO');

      expect(result.publicKey).toBe('pub_test_test123');
      expect(result.currency).toBe('COP');
      expect(result.signature).toHaveLength(64);
      expect(result.amountInCents).toBe(3000000);
      expect(paymentsRepo.create).toHaveBeenCalled();
    });

    it('should default to ABONO when type not specified', async () => {
      bookingsRepo.findById.mockResolvedValue(mockBooking as any);
      paymentsRepo.create.mockResolvedValue({ id: 'pay-1' } as any);

      const result = await service.initPayment('booking-1');

      expect(result.amountInCents).toBe(3000000);
    });
  });

  describe('initPayment — SALDO', () => {
    it('should throw if booking is not CONFIRMADA', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'PENDIENTE_PAGO' } as any);
      await expect(service.initPayment('booking-1', 'SALDO')).rejects.toThrow('confirmadas');
    });

    it('should throw if remaining balance is <= 0', async () => {
      bookingsRepo.findById.mockResolvedValue(mockConfirmedBooking as any);
      paymentsRepo.findApprovedByBookingId.mockResolvedValue([
        { ...mockApprovedPayment, amount: 100000 },
      ]);

      await expect(service.initPayment('booking-1', 'SALDO')).rejects.toThrow('completamente pagada');
    });

    it('should return widget config for remaining balance', async () => {
      bookingsRepo.findById.mockResolvedValue(mockConfirmedBooking as any);
      paymentsRepo.findApprovedByBookingId.mockResolvedValue([mockApprovedPayment]);
      paymentsRepo.create.mockResolvedValue({ id: 'pay-2' } as any);

      const result = await service.initPayment('booking-1', 'SALDO');

      expect(result.amountInCents).toBe(7000000);
      expect(paymentsRepo.create).toHaveBeenCalled();
    });
  });

  describe('validateWebhookSignature', () => {
    it('should return true for a correctly computed signature', () => {
      const secret = 'events_test_test123';
      const crypto = require('crypto');
      const timestamp = '1754912000';
      const data = `txn-1APPROVED50000${timestamp}${secret}`;
      const checksum = crypto.createHash('sha256').update(data).digest('hex');

      const valid = service.validateWebhookSignature('txn-1', 'APPROVED', '50000', timestamp, checksum);
      expect(valid).toBe(true);
    });

    it('should return false for a wrong signature', () => {
      const valid = service.validateWebhookSignature('txn-1', 'APPROVED', '50000', '9999', 'badchecksum');
      expect(valid).toBe(false);
    });
  });

  describe('handleWebhook', () => {
    it('should throw if payload is invalid', async () => {
      await expect(service.handleWebhook({}, 'checksum')).rejects.toThrow('inválido');
    });

    it('should return received for non-transaction events', async () => {
      const crypto = require('crypto');
      const secret = 'events_test_test123';
      const timestamp = 1754912000;
      const data = `tx1APPROVED50000${timestamp}${secret}`;
      const checksum = crypto.createHash('sha256').update(data).digest('hex');

      const result = await service.handleWebhook(
        { event: 'other.event', data: { transaction: { id: 'tx1', status: 'APPROVED', amount_in_cents: 50000 } }, timestamp },
        checksum,
      );
      expect(result).toEqual({ received: true });
    });

    it('should approve ABONO payment and confirm booking', async () => {
      const crypto = require('crypto');
      const secret = 'events_test_test123';
      const timestamp = 1754912000;
      const data = `txn-1APPROVED50000${timestamp}${secret}`;
      const checksum = crypto.createHash('sha256').update(data).digest('hex');

      paymentsRepo.findByWompiId.mockResolvedValue({
        ...mockApprovedPayment,
        type: 'ABONO',
        status: 'PENDIENTE',
      });
      paymentsRepo.update.mockResolvedValue(mockApprovedPayment);
      bookingsRepo.findById.mockResolvedValue(mockBooking as any);
      bookingsRepo.update.mockResolvedValue(mockConfirmedBooking as any);

      const result = await service.handleWebhook(
        {
          event: 'transaction.updated',
          data: { transaction: { id: 'txn-1', status: 'APPROVED', amount_in_cents: 50000 } },
          timestamp,
        },
        checksum,
      );

      expect(result).toEqual({ received: true });
      expect(paymentsRepo.update).toHaveBeenCalled();
      expect(bookingsRepo.update).toHaveBeenCalledWith('booking-1', { status: 'CONFIRMADA' } as any);
    });

    it('should approve SALDO payment without changing booking status', async () => {
      const crypto = require('crypto');
      const secret = 'events_test_test123';
      const timestamp = 1754912000;
      const data = `txn-2APPROVED70000${timestamp}${secret}`;
      const checksum = crypto.createHash('sha256').update(data).digest('hex');

      paymentsRepo.findByWompiId.mockResolvedValue({
        ...mockApprovedPayment,
        id: 'pay-2',
        type: 'SALDO',
        amount: 70000,
        status: 'PENDIENTE',
      });
      paymentsRepo.update.mockResolvedValue(mockApprovedPayment);
      bookingsRepo.findById.mockResolvedValue(mockConfirmedBooking as any);

      const result = await service.handleWebhook(
        {
          event: 'transaction.updated',
          data: { transaction: { id: 'txn-2', status: 'APPROVED', amount_in_cents: 70000 } },
          timestamp,
        },
        checksum,
      );

      expect(result).toEqual({ received: true });
      expect(paymentsRepo.update).toHaveBeenCalled();
      expect(bookingsRepo.update).not.toHaveBeenCalled();
    });

    it('should reject declined payments', async () => {
      const crypto = require('crypto');
      const secret = 'events_test_test123';
      const timestamp = 1754912000;
      const data = `txn-3DECLINED50000${timestamp}${secret}`;
      const checksum = crypto.createHash('sha256').update(data).digest('hex');

      paymentsRepo.findByWompiId.mockResolvedValue(mockApprovedPayment as any);
      paymentsRepo.update.mockResolvedValue(mockApprovedPayment);

      const result = await service.handleWebhook(
        {
          event: 'transaction.updated',
          data: { transaction: { id: 'txn-3', status: 'DECLINED', amount_in_cents: 50000 } },
          timestamp,
        },
        checksum,
      );

      expect(result).toEqual({ received: true });
      expect(paymentsRepo.update).toHaveBeenCalledWith('pay-1', { status: 'RECHAZADO' } as any);
    });

    it('should handle unknown wompi payment gracefully', async () => {
      const crypto = require('crypto');
      const secret = 'events_test_test123';
      const timestamp = 1754912000;
      const data = `unknownAPPROVED50000${timestamp}${secret}`;
      const checksum = crypto.createHash('sha256').update(data).digest('hex');

      paymentsRepo.findByWompiId.mockRejectedValue(new Error('Not found'));

      const result = await service.handleWebhook(
        {
          event: 'transaction.updated',
          data: { transaction: { id: 'unknown', status: 'APPROVED', amount_in_cents: 50000 } },
          timestamp,
        },
        checksum,
      );

      expect(result).toEqual({ received: true });
    });
  });

  describe('getPaymentStatus', () => {
    it('should return balance with total, paid, and remaining', async () => {
      bookingsRepo.findById.mockResolvedValue(mockConfirmedBooking as any);
      paymentsRepo.findApprovedByBookingId.mockResolvedValue([mockApprovedPayment]);

      const result = await service.getPaymentStatus('booking-1');

      expect(result.total).toBe(100000);
      expect(result.paid).toBe(30000);
      expect(result.remaining).toBe(70000);
      expect(result.payments).toHaveLength(1);
    });
  });

  describe('initCartPayment', () => {
    const cartDto = {
      items: [
        { productId: 'prod-1', name: 'Product A', price: 50000, quantity: 2 },
        { productId: 'prod-2', name: 'Product B', price: 30000, quantity: 1 },
      ],
    };

    it('should return widget config for cart total', async () => {
      paymentsRepo.create.mockResolvedValue({ id: 'pay-cart-1' } as any);

      const result = await service.initCartPayment('user-1', cartDto);

      expect(result.publicKey).toBe('pub_test_test123');
      expect(result.currency).toBe('COP');
      expect(result.signature).toHaveLength(64);
      expect(result.amountInCents).toBe(13000000);
      expect(paymentsRepo.create).toHaveBeenCalled();
    });

    it('should apply coupon discount when valid coupon provided', async () => {
      couponsRepo.findById.mockResolvedValue({
        id: 'coupon-1', code: 'DESC10', discount: 0.1, isUsed: false,
        expiresAt: new Date('2027-01-01'),
      } as any);
      paymentsRepo.create.mockResolvedValue({ id: 'pay-cart-2' } as any);

      const result = await service.initCartPayment('user-1', {
        ...cartDto, couponId: 'coupon-1',
      });

      expect(result.amountInCents).toBe(11700000);
      expect(couponsRepo.findById).toHaveBeenCalledWith('coupon-1');
    });

    it('should throw if total is <= 0', async () => {
      await expect(service.initCartPayment('user-1', { items: [] }))
        .rejects.toThrow('total debe ser mayor a 0');
    });

    it('should ignore invalid coupon gracefully', async () => {
      couponsRepo.findById.mockRejectedValue(new Error('Not found'));
      paymentsRepo.create.mockResolvedValue({ id: 'pay-cart-3' } as any);

      const result = await service.initCartPayment('user-1', {
        ...cartDto, couponId: 'bad-coupon',
      });

      expect(result.amountInCents).toBe(13000000);
    });
  });
});
