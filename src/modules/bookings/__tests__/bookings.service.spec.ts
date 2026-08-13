import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BookingsService } from '../bookings.service';
import { IBookingsRepository } from '../../../repositories/interfaces/bookings.repository';
import { IServicesRepository } from '../../../repositories/interfaces/services.repository';
import { IPaymentsRepository } from '../../../repositories/interfaces/payments.repository';
import { RedisService } from '../../../common/redis/redis.service';
import { GoogleCalendarService } from '../../../common/google-calendar/google-calendar.service';
import { MetaCapiService } from '../../meta/meta-capi.service';

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingsRepo: DeepMockProxy<IBookingsRepository>;
  let servicesRepo: DeepMockProxy<IServicesRepository>;
  let paymentsRepo: DeepMockProxy<IPaymentsRepository>;
  let redis: DeepMockProxy<RedisService>;
  let calendar: DeepMockProxy<GoogleCalendarService>;
  let metaCapi: DeepMockProxy<MetaCapiService>;

  const mockService = {
    id: 'svc-1',
    name: 'Facial Premium',
    price: 100000,
    duration: 60,
    isActive: true,
  };

  const mockBooking = {
    id: 'booking-1',
    userId: 'user-1',
    serviceId: 'svc-1',
    startTime: new Date('2026-08-15T10:00:00.000Z'),
    endTime: new Date('2026-08-15T11:00:00.000Z'),
    status: 'PENDIENTE_PAGO',
    googleEventId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { firstName: 'María', lastName: 'Gómez', email: 'maria@test.com' },
    service: mockService,
  };

  const startTimeISO = '2026-08-15T10:00:00.000Z';

  beforeEach(async () => {
    bookingsRepo = mockDeep<IBookingsRepository>();
    servicesRepo = mockDeep<IServicesRepository>();
    paymentsRepo = mockDeep<IPaymentsRepository>();
    redis = mockDeep<RedisService>();
    calendar = mockDeep<GoogleCalendarService>();
    metaCapi = mockDeep<MetaCapiService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: IBookingsRepository, useValue: bookingsRepo },
        { provide: IServicesRepository, useValue: servicesRepo },
        { provide: IPaymentsRepository, useValue: paymentsRepo },
        { provide: RedisService, useValue: redis },
        { provide: GoogleCalendarService, useValue: calendar },
        { provide: MetaCapiService, useValue: metaCapi },
      ],
    }).compile();
    service = module.get<BookingsService>(BookingsService);
  });

  describe('findAll', () => {
    it('should delegate to repository with filters', async () => {
      bookingsRepo.findAll.mockResolvedValue({ data: [mockBooking], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await service.findAll({ date: '2026-08-15' });
      expect(result.data).toHaveLength(1);
      expect(bookingsRepo.findAll).toHaveBeenCalledWith({ date: '2026-08-15' });
    });
  });

  describe('findById', () => {
    it('should delegate to repository', async () => {
      bookingsRepo.findById.mockResolvedValue(mockBooking);
      const result = await service.findById('booking-1');
      expect(result.id).toBe('booking-1');
      expect(bookingsRepo.findById).toHaveBeenCalledWith('booking-1');
    });
  });

  describe('create', () => {
    it('should create booking with Redis lock when slot is free', async () => {
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOverlapping.mockResolvedValue(null);
      bookingsRepo.create.mockResolvedValue({ ...mockBooking, id: 'new-booking' } as any);

      const result = await service.create('user-1', {
        serviceId: 'svc-1',
        startTime: startTimeISO,
      });

      expect(result.id).toBe('new-booking');
      expect(redis.setex).toHaveBeenCalledWith(
        expect.stringContaining('slot:2026-08-15'),
        600,
        expect.any(String),
      );
      expect(bookingsRepo.create).toHaveBeenCalled();
    });

    it('should throw ConflictException when slot overlaps another booking', async () => {
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOverlapping.mockResolvedValue(mockBooking as any);

      await expect(
        service.create('user-1', { serviceId: 'svc-1', startTime: startTimeISO }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('confirm', () => {
    it('should confirm booking and set Google Calendar event', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'PENDIENTE_PAGO' });
      bookingsRepo.update.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' });
      calendar.createEvent.mockResolvedValue('google-event-123');

      const result = await service.confirm('booking-1');

      expect(redis.del).toHaveBeenCalled();
      expect(calendar.createEvent).toHaveBeenCalled();
      expect(bookingsRepo.update).toHaveBeenCalledWith('booking-1', { status: 'CONFIRMADA' } as any);
      expect(metaCapi.sendEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'Schedule' }),
      );
    });

    it('should not update googleEventId if calendar returns null', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'PENDIENTE_PAGO' });
      bookingsRepo.update.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' });
      calendar.createEvent.mockResolvedValue(null);

      await service.confirm('booking-1');

      expect(bookingsRepo.update).toHaveBeenCalledTimes(1);
    });

    it('should throw if booking is not PENDIENTE_PAGO', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' });

      await expect(service.confirm('booking-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('should cancel booking as owner', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' });
      bookingsRepo.update.mockResolvedValue({ ...mockBooking, status: 'CANCELADA' });

      const result = await service.cancel('booking-1', 'user-1', false);

      expect(result.status).toBe('CANCELADA');
      expect(redis.del).toHaveBeenCalled();
    });

    it('should cancel booking as admin', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA', userId: 'user-2' });
      bookingsRepo.update.mockResolvedValue({ ...mockBooking, status: 'CANCELADA' });

      const result = await service.cancel('booking-1', 'user-1', true);

      expect(result.status).toBe('CANCELADA');
    });

    it('should throw ForbiddenException if not owner and not admin', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA', userId: 'user-2' });

      await expect(service.cancel('booking-1', 'user-3', false)).rejects.toThrow(ForbiddenException);
    });

    it('should throw if booking is already COMPLETADA', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'COMPLETADA' });

      await expect(service.cancel('booking-1', 'user-1', false)).rejects.toThrow(BadRequestException);
    });

    it('should delete Google Calendar event if googleEventId exists', async () => {
      bookingsRepo.findById.mockResolvedValue({
        ...mockBooking,
        status: 'CONFIRMADA',
        googleEventId: 'google-event-123',
      });
      bookingsRepo.update.mockResolvedValue({ ...mockBooking, status: 'CANCELADA' });

      await service.cancel('booking-1', 'user-1', false);

      expect(calendar.deleteEvent).toHaveBeenCalledWith('google-event-123');
    });
  });

  describe('complete', () => {
    it('should mark CONFIRMADA booking as COMPLETADA when fully paid', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' });
      paymentsRepo.findApprovedByBookingId.mockResolvedValue([
        { id: 'p1', bookingId: 'booking-1', userId: 'user-1', amount: 100000, type: 'SALDO', status: 'APROBADO', wompiPaymentId: null, wompiReference: null, paidAt: null, createdAt: new Date(), updatedAt: new Date() },
      ] as any);
      bookingsRepo.update.mockResolvedValue({ ...mockBooking, status: 'COMPLETADA' });

      const result = await service.complete('booking-1');

      expect(result.status).toBe('COMPLETADA');
    });

    it('should throw if booking has remaining balance', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' });
      paymentsRepo.findApprovedByBookingId.mockResolvedValue([
        { id: 'p1', bookingId: 'booking-1', userId: 'user-1', amount: 30000, type: 'ABONO', status: 'APROBADO', wompiPaymentId: null, wompiReference: null, paidAt: null, createdAt: new Date(), updatedAt: new Date() },
      ] as any);

      await expect(service.complete('booking-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw if booking is not CONFIRMADA', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'PENDIENTE_PAGO' });

      await expect(service.complete('booking-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('reopen', () => {
    it('should revert COMPLETADA booking to CONFIRMADA', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'COMPLETADA' });
      bookingsRepo.update.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' });

      const result = await service.reopen('booking-1');

      expect(result.status).toBe('CONFIRMADA');
      expect(bookingsRepo.update).toHaveBeenCalledWith('booking-1', { status: 'CONFIRMADA' } as any);
    });

    it('should throw if booking is not COMPLETADA or NO_ASISTIO', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' });

      await expect(service.reopen('booking-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('reschedule', () => {
    const newStartTime = '2026-08-15T14:00:00.000Z';

    it('should reschedule booking in place preserving payments and id', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' });
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOverlapping.mockResolvedValue(null);
      bookingsRepo.update.mockResolvedValue({ ...mockBooking, startTime: new Date(newStartTime) } as any);

      const result = await service.reschedule('booking-1', newStartTime, 'user-1', false);

      expect(result.id).toBe('booking-1');
      expect(bookingsRepo.update).toHaveBeenCalledWith(
        'booking-1',
        expect.objectContaining({ startTime: expect.any(Date), endTime: expect.any(Date) }),
      );
      expect(bookingsRepo.create).not.toHaveBeenCalled();
    });

    it('should update Google Calendar event if googleEventId exists', async () => {
      bookingsRepo.findById.mockResolvedValue({
        ...mockBooking,
        status: 'CONFIRMADA',
        googleEventId: 'google-event-123',
      });
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOverlapping.mockResolvedValue(null);
      bookingsRepo.update.mockResolvedValue({ ...mockBooking } as any);

      await service.reschedule('booking-1', newStartTime, 'user-1', false);

      expect(calendar.updateEvent).toHaveBeenCalledWith('google-event-123', expect.any(Object));
    });

    it('should throw ConflictException if new slot overlaps another booking', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' });
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOverlapping.mockResolvedValue({ ...mockBooking, id: 'booking-3' } as any);

      await expect(
        service.reschedule('booking-1', newStartTime, 'user-1', false),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException if not owner and not admin', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA', userId: 'user-2' });

      await expect(
        service.reschedule('booking-1', newStartTime, 'user-3', false),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getAvailability', () => {
    it('should return free slots excluding occupied and locked', async () => {
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOccupied.mockResolvedValue([
        { startTime: new Date('2026-08-15T10:00:00.000Z'), endTime: new Date('2026-08-15T11:00:00.000Z') },
      ]);
      redis.keys.mockResolvedValue([]);

      const slots = await service.getAvailability('svc-1', '2026-08-15');

      expect(slots.length).toBeGreaterThan(0);
      const occupiedSlot = slots.find((s) => s.includes('10:00:00'));
      expect(occupiedSlot).toBeUndefined();
    });

    it('should exclude Redis-locked slots', async () => {
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOccupied.mockResolvedValue([]);
      redis.keys.mockResolvedValue(['slot:2026-08-15:2026-08-15T09:00:00.000Z']);
      redis.get.mockResolvedValue(
        JSON.stringify({
          start: '2026-08-15T09:00:00.000Z',
          end: '2026-08-15T10:00:00.000Z',
        }),
      );

      const slots = await service.getAvailability('svc-1', '2026-08-15');

      const lockedSlot = slots.find((s) => s.includes('09:00:00'));
      expect(lockedSlot).toBeUndefined();
    });
  });
});
