import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PaymentsService } from '../payments.service';
import { IPaymentsRepository } from '../../../repositories/interfaces/payments.repository';
import { IBookingsRepository } from '../../../repositories/interfaces/bookings.repository';
import { ICouponsRepository } from '../../../repositories/interfaces/coupons.repository';
import { IProductsRepository } from '../../../repositories/interfaces/products.repository';
import { IOrdersRepository } from '../../../repositories/interfaces/orders.repository';
import { MetaCapiService } from '../../meta/meta-capi.service';
import { EmailService } from '../../../common/email/email.service';
import { BookingSyncService } from '../../bookings/booking-sync.service';
import { IPaymentProvider, NormalizedPaymentEvent } from '../providers/payment-provider';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentsRepo: DeepMockProxy<IPaymentsRepository>;
  let bookingsRepo: DeepMockProxy<IBookingsRepository>;
  let couponsRepo: DeepMockProxy<ICouponsRepository>;
  let productsRepo: DeepMockProxy<IProductsRepository>;
  let ordersRepo: DeepMockProxy<IOrdersRepository>;
  let paymentProvider: DeepMockProxy<IPaymentProvider>;
  let metaCapi: DeepMockProxy<MetaCapiService>;
  let emailService: DeepMockProxy<EmailService>;
  let bookingSync: DeepMockProxy<BookingSyncService>;

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

  const mockEvent: NormalizedPaymentEvent = {
    eventName: 'transaction.updated',
    transactionId: 'txn-1',
    status: 'APPROVED',
    reference: 'ref-1',
    amountInCents: '50000',
    timestamp: '1754912000',
    checksum: 'checksum-abc',
  };

  beforeEach(async () => {
    paymentsRepo = mockDeep<IPaymentsRepository>();
    bookingsRepo = mockDeep<IBookingsRepository>();
    couponsRepo = mockDeep<ICouponsRepository>();
    productsRepo = mockDeep<IProductsRepository>();
    ordersRepo = mockDeep<IOrdersRepository>();
    paymentProvider = mockDeep<IPaymentProvider>();
    metaCapi = mockDeep<MetaCapiService>();
    emailService = mockDeep<EmailService>();
    bookingSync = mockDeep<BookingSyncService>();

    paymentProvider.createPaymentIntent.mockImplementation(
      ({ reference, amountInCents, currency }) => ({
        publicKey: 'pub_test_test123',
        reference,
        amountInCents,
        currency,
        signature: 'a'.repeat(64),
      }),
    );
    paymentProvider.parseWebhook.mockReturnValue({ ok: true, event: mockEvent });
    paymentProvider.verifyWebhookSignature.mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: IPaymentsRepository, useValue: paymentsRepo },
        { provide: IBookingsRepository, useValue: bookingsRepo },
        { provide: ICouponsRepository, useValue: couponsRepo },
        { provide: IProductsRepository, useValue: productsRepo },
        { provide: IOrdersRepository, useValue: ordersRepo },
        { provide: IPaymentProvider, useValue: paymentProvider },
        { provide: MetaCapiService, useValue: metaCapi },
        { provide: EmailService, useValue: emailService },
        { provide: BookingSyncService, useValue: bookingSync },
      ],
    }).compile();
    service = module.get<PaymentsService>(PaymentsService);
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
      expect(paymentProvider.createPaymentIntent).toHaveBeenCalled();
    });

    it('should default to ABONO when type not specified', async () => {
      bookingsRepo.findById.mockResolvedValue(mockBooking as any);
      paymentsRepo.create.mockResolvedValue({ id: 'pay-1' } as any);

      const result = await service.initPayment('booking-1');

      expect(result.amountInCents).toBe(3000000);
    });

    it('should charge full price when payFull is true', async () => {
      bookingsRepo.findById.mockResolvedValue(mockBooking as any);
      paymentsRepo.create.mockResolvedValue({ id: 'pay-1' } as any);

      const result = await service.initPayment('booking-1', 'ABONO', { payFull: true });

      expect(result.amountInCents).toBe(10000000);
      expect(paymentsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100000,
          metadata: expect.objectContaining({ payFull: true }),
        }),
      );
    });

    it('should store fbc/fbp/eventId in payment metadata', async () => {
      bookingsRepo.findById.mockResolvedValue(mockBooking as any);
      paymentsRepo.create.mockResolvedValue({ id: 'pay-1' } as any);

      await service.initPayment('booking-1', 'ABONO', {
        fbc: 'fb.1.abc',
        fbp: 'fb.2.def',
        eventId: 'evt-9',
      });

      expect(paymentsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ fbc: 'fb.1.abc', fbp: 'fb.2.def', eventId: 'evt-9' }),
        }),
      );
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

      await expect(service.initPayment('booking-1', 'SALDO')).rejects.toThrow(
        'completamente pagada',
      );
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

  describe('handleWebhook', () => {
    it('should throw if payload is invalid', async () => {
      paymentProvider.parseWebhook.mockReturnValue({ ok: false, reason: 'invalid_payload' });
      await expect(service.handleWebhook({}, 'checksum')).rejects.toThrow('inválido');
    });

    it('should throw if webhook signature is invalid', async () => {
      paymentProvider.verifyWebhookSignature.mockReturnValue(false);
      await expect(service.handleWebhook({}, 'checksum')).rejects.toThrow(
        'Firma de webhook inválida',
      );
    });

    it('should return received for non-transaction events', async () => {
      paymentProvider.parseWebhook.mockReturnValue({
        ok: true,
        event: { ...mockEvent, eventName: 'other.event' },
      });

      const result = await service.handleWebhook({}, 'checksum');
      expect(result).toEqual({ received: true });
    });

    it('should approve ABONO payment and confirm booking', async () => {
      paymentsRepo.findByWompiId.mockResolvedValue({
        ...mockApprovedPayment,
        type: 'ABONO',
        status: 'PENDIENTE',
      });
      paymentsRepo.update.mockResolvedValue(mockApprovedPayment);
      bookingsRepo.findById.mockResolvedValue(mockBooking as any);
      bookingsRepo.update.mockResolvedValue(mockConfirmedBooking as any);

      const result = await service.handleWebhook({}, 'checksum');

      expect(result).toEqual({ received: true });
      expect(paymentsRepo.update).toHaveBeenCalled();
      expect(bookingSync.confirmAndSync).toHaveBeenCalledWith(
        'booking-1',
        expect.objectContaining({ fbc: undefined }),
      );
      expect(emailService.sendBookingReceipt).toHaveBeenCalled();
      expect(emailService.sendAdminBookingNotification).toHaveBeenCalled();
    });

    it('should approve SALDO payment without changing booking status', async () => {
      paymentsRepo.findByWompiId.mockResolvedValue({
        ...mockApprovedPayment,
        id: 'pay-2',
        type: 'SALDO',
        amount: 70000,
        status: 'PENDIENTE',
      });
      paymentsRepo.update.mockResolvedValue(mockApprovedPayment);
      bookingsRepo.findById.mockResolvedValue(mockConfirmedBooking as any);

      const result = await service.handleWebhook({}, 'checksum');

      expect(result).toEqual({ received: true });
      expect(paymentsRepo.update).toHaveBeenCalled();
      expect(bookingsRepo.update).not.toHaveBeenCalled();
    });

    it('should ignore duplicate APPROVED webhooks', async () => {
      paymentsRepo.findByWompiId.mockResolvedValue({
        ...mockApprovedPayment,
        type: 'ABONO',
        status: 'APROBADO',
      });

      const result = await service.handleWebhook({}, 'checksum');

      expect(result).toEqual({ received: true });
      expect(paymentsRepo.update).not.toHaveBeenCalled();
      expect(bookingsRepo.update).not.toHaveBeenCalled();
    });

    it('should reject declined payments', async () => {
      paymentProvider.parseWebhook.mockReturnValue({
        ok: true,
        event: { ...mockEvent, status: 'DECLINED', transactionId: 'txn-3' },
      });
      paymentsRepo.findByWompiId.mockResolvedValue(mockApprovedPayment as any);
      paymentsRepo.update.mockResolvedValue(mockApprovedPayment);

      const result = await service.handleWebhook({}, 'checksum');

      expect(result).toEqual({ received: true });
      expect(paymentsRepo.update).toHaveBeenCalledWith('pay-1', { status: 'RECHAZADO' } as any);
    });

    it('should handle unknown wompi payment gracefully', async () => {
      paymentsRepo.findByWompiId.mockRejectedValue(new Error('Not found'));

      const result = await service.handleWebhook({}, 'checksum');

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
      expect(paymentProvider.createPaymentIntent).toHaveBeenCalled();
    });

    it('should apply coupon discount when valid coupon provided', async () => {
      couponsRepo.findById.mockResolvedValue({
        id: 'coupon-1',
        code: 'DESC10',
        discount: 0.1,
        isActive: true,
        maxUses: null,
        usedCount: 0,
        perUserLimit: 1,
        expiresAt: new Date('2027-01-01'),
      } as any);
      paymentsRepo.create.mockResolvedValue({ id: 'pay-cart-2' } as any);

      const result = await service.initCartPayment('user-1', {
        ...cartDto,
        couponId: 'coupon-1',
      });

      expect(result.amountInCents).toBe(11700000);
      expect(couponsRepo.findById).toHaveBeenCalledWith('coupon-1');
    });

    it('should throw if total is <= 0', async () => {
      await expect(service.initCartPayment('user-1', { items: [] })).rejects.toThrow(
        'total debe ser mayor a 0',
      );
    });

    it('should ignore invalid coupon gracefully', async () => {
      couponsRepo.findById.mockRejectedValue(new Error('Not found'));
      paymentsRepo.create.mockResolvedValue({ id: 'pay-cart-3' } as any);

      const result = await service.initCartPayment('user-1', {
        ...cartDto,
        couponId: 'bad-coupon',
      });

      expect(result.amountInCents).toBe(13000000);
    });
  });
});
