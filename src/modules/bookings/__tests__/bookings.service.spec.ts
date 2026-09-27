import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BookingsService } from '../bookings.service';
import { IBookingsRepository } from '../../../repositories/interfaces/bookings.repository';
import { IServicesRepository } from '../../../repositories/interfaces/services.repository';
import { IPaymentsRepository } from '../../../repositories/interfaces/payments.repository';
import { RedisService } from '../../../common/redis/redis.service';
import { GoogleCalendarService } from '../../../common/google-calendar/google-calendar.service';
import { BookingSyncService } from '../booking-sync.service';

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingsRepo: DeepMockProxy<IBookingsRepository>;
  let servicesRepo: DeepMockProxy<IServicesRepository>;
  let paymentsRepo: DeepMockProxy<IPaymentsRepository>;
  let redis: DeepMockProxy<RedisService>;
  let calendar: DeepMockProxy<GoogleCalendarService>;
  let bookingSync: DeepMockProxy<BookingSyncService>;

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
    user: { firstName: 'María', lastName: 'Gómez', email: 'maria@test.com', phone: '3001234567' },
    service: mockService,
  };

  const startTimeISO = '2026-08-15T10:00:00.000Z';

  beforeEach(async () => {
    bookingsRepo = mockDeep<IBookingsRepository>();
    servicesRepo = mockDeep<IServicesRepository>();
    paymentsRepo = mockDeep<IPaymentsRepository>();
    redis = mockDeep<RedisService>();
    calendar = mockDeep<GoogleCalendarService>();
    bookingSync = mockDeep<BookingSyncService>();

    await build();
  });

  /** Rebuilds the service with a different booking policy (defaults if empty). */
  async function build(env: Record<string, unknown> = {}) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            BOOKING_PAYMENT_TTL_MINUTES: 30,
            BOOKING_MAX_PENDING_PER_USER: 2,
            ...env,
          }),
        },
        { provide: IBookingsRepository, useValue: bookingsRepo },
        { provide: IServicesRepository, useValue: servicesRepo },
        { provide: IPaymentsRepository, useValue: paymentsRepo },
        { provide: RedisService, useValue: redis },
        { provide: GoogleCalendarService, useValue: calendar },
        { provide: BookingSyncService, useValue: bookingSync },
      ],
    }).compile();
    service = module.get<BookingsService>(BookingsService);

    // Defaults of the happy path; individual tests override what they need.
    bookingsRepo.countPendingByUser.mockResolvedValue(0);
    bookingsRepo.findOverduePending.mockResolvedValue([]);
    bookingsRepo.markExpired.mockResolvedValue(true);
    redis.del.mockResolvedValue(1);
    calendar.deleteEvent.mockResolvedValue(undefined);
    bookingsRepo.findByIdempotencyKey.mockResolvedValue(null);
    bookingsRepo.createWithIdempotencyKey.mockResolvedValue({
      booking: mockBooking as never,
      replayed: false,
    });
  }

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

    it('should look for overlaps with the configured payment window', async () => {
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOverlapping.mockResolvedValue(null);
      bookingsRepo.create.mockResolvedValue({ ...mockBooking } as any);

      await service.create('user-1', { serviceId: 'svc-1', startTime: startTimeISO });

      const [, , deadline] = bookingsRepo.findOverlapping.mock.calls[0];
      const elapsed = Date.now() - deadline.getTime();
      expect(elapsed).toBeGreaterThanOrEqual(30 * 60000 - 1000);
      expect(elapsed).toBeLessThan(30 * 60000 + 1000);
    });

    it('should throw ConflictException when the user reached the pending bookings cap', async () => {
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.countPendingByUser.mockResolvedValue(2);

      await expect(
        service.create('user-1', { serviceId: 'svc-1', startTime: startTimeISO }),
      ).rejects.toThrow(ConflictException);

      // No lock and no booking are taken: the cap is checked before anything else.
      expect(redis.setex).not.toHaveBeenCalled();
      expect(bookingsRepo.create).not.toHaveBeenCalled();
      expect(bookingsRepo.findOverlapping).not.toHaveBeenCalled();
    });

    it('should not apply the cap to a booking created by the salon staff', async () => {
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.countPendingByUser.mockResolvedValue(99);
      bookingsRepo.findOverlapping.mockResolvedValue(null);
      bookingsRepo.create.mockResolvedValue({ ...mockBooking } as any);

      await service.create('user-1', { serviceId: 'svc-1', startTime: startTimeISO }, { enforcePendingCap: false });

      expect(bookingsRepo.countPendingByUser).not.toHaveBeenCalled();
      expect(bookingsRepo.create).toHaveBeenCalled();
    });
  });

  describe('idempotency (ADR 0008/0012)', () => {
    const KEY = 'turn-1:crearCita';

    it('should return the booking of the first call when the key was already used', async () => {
      bookingsRepo.findByIdempotencyKey.mockResolvedValue({ ...mockBooking } as any);

      const result = await service.create(
        'user-1',
        { serviceId: 'svc-1', startTime: startTimeISO },
        { idempotencyKey: KEY },
      );

      expect(result.id).toBe('booking-1');
      // A retry must not be rejected by the state the first call created, and it
      // must not create anything: no cap check, no lock, no second booking.
      expect(bookingsRepo.countPendingByUser).not.toHaveBeenCalled();
      expect(redis.setex).not.toHaveBeenCalled();
      expect(bookingsRepo.create).not.toHaveBeenCalled();
      expect(bookingsRepo.createWithIdempotencyKey).not.toHaveBeenCalled();
    });

    it('should send the key to the repository when it is new', async () => {
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOverlapping.mockResolvedValue(null);

      await service.create(
        'user-1',
        { serviceId: 'svc-1', startTime: startTimeISO },
        { idempotencyKey: KEY },
      );

      expect(bookingsRepo.createWithIdempotencyKey).toHaveBeenCalledWith(
        expect.objectContaining({ startTime: expect.any(Date), endTime: expect.any(Date) }),
        KEY,
      );
      expect(bookingsRepo.create).not.toHaveBeenCalled();
    });

    it('should return the winner booking when two calls race with the same key', async () => {
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOverlapping.mockResolvedValue(null);
      bookingsRepo.createWithIdempotencyKey.mockResolvedValue({
        booking: { ...mockBooking, id: 'winner' } as never,
        replayed: true,
      });

      const result = await service.create(
        'user-1',
        { serviceId: 'svc-1', startTime: startTimeISO },
        { idempotencyKey: KEY },
      );

      expect(result.id).toBe('winner');
    });

    it('should reject a key that belongs to another user', async () => {
      bookingsRepo.findByIdempotencyKey.mockResolvedValue({
        ...mockBooking,
        userId: 'other-user',
      } as any);

      await expect(
        service.create(
          'user-1',
          { serviceId: 'svc-1', startTime: startTimeISO },
          { idempotencyKey: KEY },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it.each(['con espacio', 'ñ'.repeat(3), 'x'.repeat(201)])(
      'should reject the malformed idempotency key (%s)',
      async (key) => {
        await expect(
          service.create(
            'user-1',
            { serviceId: 'svc-1', startTime: startTimeISO },
            { idempotencyKey: key },
          ),
        ).rejects.toThrow(BadRequestException);

        expect(servicesRepo.findById).not.toHaveBeenCalled();
      },
    );

    it('should not look up any key when the header is absent', async () => {
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOverlapping.mockResolvedValue(null);
      bookingsRepo.create.mockResolvedValue({ ...mockBooking } as any);

      await service.create('user-1', { serviceId: 'svc-1', startTime: startTimeISO });

      expect(bookingsRepo.findByIdempotencyKey).not.toHaveBeenCalled();
      expect(bookingsRepo.createWithIdempotencyKey).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('should delegate confirmation and calendar sync to BookingSyncService', async () => {
      bookingSync.confirmAndSync.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' } as any);

      const result = await service.confirm('booking-1');

      expect(result.status).toBe('CONFIRMADA');
      expect(bookingSync.confirmAndSync).toHaveBeenCalledWith('booking-1');
    });
  });

  describe('syncPendingCalendar', () => {
    it('should delegate to BookingSyncService', async () => {
      bookingSync.syncPending.mockResolvedValue({ synced: 2, failed: 0 });

      const result = await service.syncPendingCalendar();

      expect(result).toEqual({ synced: 2, failed: 0 });
      expect(bookingSync.syncPending).toHaveBeenCalled();
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
    it('should throw BadRequestException when the booking expired without payment', async () => {
      bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'EXPIRADA' });

      await expect(
        service.reschedule('booking-1', '2026-08-16T10:00:00.000Z', 'user-1', false),
      ).rejects.toThrow(BadRequestException);

      expect(bookingsRepo.update).not.toHaveBeenCalled();
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

    it('getAvailabilityWindow returns each slot with its end instant', async () => {
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOccupied.mockResolvedValue([]);
      redis.keys.mockResolvedValue([]);

      const window = await service.getAvailabilityWindow('svc-1', '2026-08-15');

      expect(window.serviceId).toBe('svc-1');
      expect(window.date).toBe('2026-08-15');
      expect(window.slots.length).toBeGreaterThan(0);
      expect(window.slots[0].end.getTime() - window.slots[0].start.getTime()).toBe(60 * 60000);
    });

    it('getAvailability and getAvailabilityWindow agree on the slot instants', async () => {
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOccupied.mockResolvedValue([]);
      redis.keys.mockResolvedValue([]);

      const slots = await service.getAvailability('svc-1', '2026-08-15');
      const window = await service.getAvailabilityWindow('svc-1', '2026-08-15');

      expect(window.slots.map((slot) => slot.start.toISOString())).toEqual(slots);
    });
  });

  describe('expireOverduePendingBookings', () => {
    it('moves the overdue pending bookings to EXPIRADA and releases their slot', async () => {
      bookingsRepo.findOverduePending.mockResolvedValue([
        { id: 'booking-1', startTime: mockBooking.startTime, googleEventId: null },
        { id: 'booking-2', startTime: mockBooking.startTime, googleEventId: null },
      ]);

      const result = await service.expireOverduePendingBookings();

      expect(result).toEqual({ expired: 2 });
      expect(bookingsRepo.markExpired).toHaveBeenCalledWith('booking-1');
      expect(bookingsRepo.markExpired).toHaveBeenCalledWith('booking-2');
      expect(redis.del).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalledWith('slot:2026-08-15:2026-08-15T10:00:00.000Z');
    });

    it('selects the bookings with the configured payment window', async () => {
      await service.expireOverduePendingBookings();

      const [deadline] = bookingsRepo.findOverduePending.mock.calls[0];
      const elapsed = Date.now() - deadline.getTime();
      expect(elapsed).toBeGreaterThanOrEqual(30 * 60000 - 1000);
      expect(elapsed).toBeLessThan(30 * 60000 + 1000);
    });

    it('keeps a booking that a payment confirmed during the sweep', async () => {
      bookingsRepo.findOverduePending.mockResolvedValue([
        { id: 'booking-1', startTime: mockBooking.startTime, googleEventId: null },
      ]);
      bookingsRepo.markExpired.mockResolvedValue(false);

      const result = await service.expireOverduePendingBookings();

      expect(result).toEqual({ expired: 0 });
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('removes the calendar event when the expired booking had one', async () => {
      bookingsRepo.findOverduePending.mockResolvedValue([
        { id: 'booking-1', startTime: mockBooking.startTime, googleEventId: 'google-event-123' },
      ]);

      await service.expireOverduePendingBookings();

      expect(calendar.deleteEvent).toHaveBeenCalledWith('google-event-123');
    });
  });

  describe('booking policy configuration', () => {
    it('falls back to the documented defaults when nothing is configured', async () => {
      await build({ BOOKING_PAYMENT_TTL_MINUTES: undefined, BOOKING_MAX_PENDING_PER_USER: undefined });
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOccupied.mockResolvedValue([]);
      redis.keys.mockResolvedValue([]);

      await service.getAvailability('svc-1', '2026-08-15');

      const [, deadline] = bookingsRepo.findOccupied.mock.calls[0];
      const elapsed = Date.now() - deadline.getTime();
      expect(elapsed).toBeGreaterThanOrEqual(30 * 60000 - 1000);
      expect(elapsed).toBeLessThan(30 * 60000 + 1000);
    });

    it('honours a shorter payment window', async () => {
      await build({ BOOKING_PAYMENT_TTL_MINUTES: 15 });
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.findOccupied.mockResolvedValue([]);
      redis.keys.mockResolvedValue([]);

      await service.getAvailability('svc-1', '2026-08-15');

      const [, deadline] = bookingsRepo.findOccupied.mock.calls[0];
      const elapsed = Date.now() - deadline.getTime();
      expect(elapsed).toBeGreaterThanOrEqual(15 * 60000 - 1000);
      expect(elapsed).toBeLessThan(15 * 60000 + 1000);
    });

    it('honours a custom pending bookings cap', async () => {
      await build({ BOOKING_MAX_PENDING_PER_USER: 1 });
      servicesRepo.findById.mockResolvedValue(mockService as any);
      bookingsRepo.countPendingByUser.mockResolvedValue(1);

      await expect(
        service.create('user-1', { serviceId: 'svc-1', startTime: startTimeISO }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
