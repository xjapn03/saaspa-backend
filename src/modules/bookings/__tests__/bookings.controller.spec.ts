import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BookingsController } from '../bookings.controller';
import { BookingsService } from '../bookings.service';
import { PaymentsService } from '../../payments/payments.service';

describe('BookingsController', () => {
  let controller: BookingsController;
  let bookingsService: DeepMockProxy<BookingsService>;
  let paymentsService: DeepMockProxy<PaymentsService>;

  const mockBooking = {
    id: 'booking-1',
    userId: 'user-1',
    serviceId: 'svc-1',
    startTime: '2026-08-15T10:00:00.000Z',
    endTime: '2026-08-15T11:00:00.000Z',
    status: 'PENDIENTE_PAGO',
    googleEventId: null,
    notes: null,
  };

  beforeEach(async () => {
    bookingsService = mockDeep<BookingsService>();
    paymentsService = mockDeep<PaymentsService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: bookingsService },
        { provide: PaymentsService, useValue: paymentsService },
      ],
    }).compile();
    controller = module.get<BookingsController>(BookingsController);
  });

  describe('findAll', () => {
    it('should delegate to service with filters', async () => {
      bookingsService.findAll.mockResolvedValue({ data: [mockBooking as any], total: 1, page: 1, limit: 20, totalPages: 1 });

      const result = await controller.findAll('user-1', 'ADMIN', '2026-08-15', 'PENDIENTE_PAGO');

      expect(result.data).toHaveLength(1);
      expect(bookingsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ date: '2026-08-15', status: 'PENDIENTE_PAGO' }),
      );
    });

    it('should add userId filter for CLIENTE role', async () => {
      bookingsService.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      await controller.findAll('user-1', 'CLIENTE');

      expect(bookingsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
      );
    });
  });

  describe('getAvailability', () => {
    it('should return available slots', async () => {
      bookingsService.getAvailability.mockResolvedValue([
        '2026-08-15T08:00:00.000Z',
        '2026-08-15T08:30:00.000Z',
      ]);

      const result = await controller.getAvailability('svc-1', '2026-08-15');

      expect(result).toHaveLength(2);
      expect(bookingsService.getAvailability).toHaveBeenCalledWith('svc-1', '2026-08-15');
    });
  });

  describe('create', () => {
    it('should create booking for current user', async () => {
      bookingsService.create.mockResolvedValue(mockBooking as any);
      const dto = { serviceId: 'svc-1', startTime: '2026-08-15T10:00:00.000Z' };

      const result = await controller.create('user-1', dto);

      expect(result.id).toBe('booking-1');
      expect(bookingsService.create).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('cancel', () => {
    it('should cancel booking with isAdmin=true for ADMIN role', async () => {
      bookingsService.cancel.mockResolvedValue({ ...mockBooking, status: 'CANCELADA' } as any);

      await controller.cancel('booking-1', 'user-1', 'ADMIN');

      expect(bookingsService.cancel).toHaveBeenCalledWith('booking-1', 'user-1', true);
    });

    it('should cancel booking with isAdmin=false for CLIENTE role', async () => {
      bookingsService.cancel.mockResolvedValue({ ...mockBooking, status: 'CANCELADA' } as any);

      await controller.cancel('booking-1', 'user-1', 'CLIENTE');

      expect(bookingsService.cancel).toHaveBeenCalledWith('booking-1', 'user-1', false);
    });
  });

  describe('getBalance', () => {
    it('should delegate to paymentsService', async () => {
      paymentsService.getPaymentStatus.mockResolvedValue({
        total: 100000,
        paid: 30000,
        remaining: 70000,
        payments: [],
      });

      const result = await controller.getBalance('booking-1');

      expect(result.total).toBe(100000);
      expect(paymentsService.getPaymentStatus).toHaveBeenCalledWith('booking-1');
    });
  });
});
