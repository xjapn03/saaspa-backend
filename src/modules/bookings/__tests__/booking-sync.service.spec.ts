import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { BookingSyncService } from '../booking-sync.service';
import { IBookingsRepository } from '../../../repositories/interfaces/bookings.repository';
import { GoogleCalendarService } from '../../../common/google-calendar/google-calendar.service';
import { MetaCapiService } from '../../meta/meta-capi.service';
import { RedisService } from '../../../common/redis/redis.service';

describe('BookingSyncService', () => {
  let service: BookingSyncService;
  let bookingsRepo: DeepMockProxy<IBookingsRepository>;
  let calendar: DeepMockProxy<GoogleCalendarService>;
  let metaCapi: DeepMockProxy<MetaCapiService>;
  let redis: DeepMockProxy<RedisService>;

  const mockBooking = {
    id: 'booking-1',
    userId: 'user-1',
    serviceId: 'svc-1',
    startTime: new Date('2026-08-15T10:00:00.000Z'),
    endTime: new Date('2026-08-15T11:00:00.000Z'),
    status: 'PENDIENTE_PAGO',
    googleEventId: null,
    calendarSync: 'SYNCED',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { firstName: 'María', lastName: 'Gómez', email: 'maria@test.com', phone: '3001234567' },
    service: { name: 'Facial', price: 100000, duration: 60 },
  };

  beforeEach(async () => {
    bookingsRepo = mockDeep<IBookingsRepository>();
    calendar = mockDeep<GoogleCalendarService>();
    metaCapi = mockDeep<MetaCapiService>();
    redis = mockDeep<RedisService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingSyncService,
        { provide: IBookingsRepository, useValue: bookingsRepo },
        { provide: GoogleCalendarService, useValue: calendar },
        { provide: MetaCapiService, useValue: metaCapi },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<BookingSyncService>(BookingSyncService);
  });

  it('should confirm PENDIENTE_PAGO booking, create event and store googleEventId', async () => {
    bookingsRepo.findById.mockResolvedValue(mockBooking as any);
    bookingsRepo.update.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' } as any);
    calendar.createEvent.mockResolvedValue('evt-123');
    redis.del.mockResolvedValue(1);

    await service.confirmAndSync('booking-1');

    expect(bookingsRepo.update).toHaveBeenCalledWith('booking-1', { status: 'CONFIRMADA' } as any);
    expect(bookingsRepo.update).toHaveBeenCalledWith('booking-1', { googleEventId: 'evt-123', calendarSync: 'SYNCED' } as any);
    expect(metaCapi.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'Schedule',
        userData: expect.objectContaining({ em: expect.any(String) }),
      }),
    );
  });

  it('should pass fbc/fbp attribution to the Schedule event', async () => {
    bookingsRepo.findById.mockResolvedValue(mockBooking as any);
    bookingsRepo.update.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' } as any);
    calendar.createEvent.mockResolvedValue('evt-123');
    redis.del.mockResolvedValue(1);

    await service.confirmAndSync('booking-1', { fbc: 'fb.1.abc', fbp: 'fb.2.def' });

    expect(metaCapi.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'Schedule',
        eventId: 'schedule-booking-1',
        userData: expect.objectContaining({ fbc: 'fb.1.abc', fbp: 'fb.2.def' }),
      }),
    );
  });

  it('should mark calendarSync FAILED when calendar returns null', async () => {
    bookingsRepo.findById.mockResolvedValue(mockBooking as any);
    bookingsRepo.update.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA' } as any);
    calendar.createEvent.mockResolvedValue(null);
    redis.del.mockResolvedValue(1);

    await service.confirmAndSync('booking-1');

    expect(bookingsRepo.update).toHaveBeenCalledWith('booking-1', { calendarSync: 'FAILED' } as any);
  });

  it('should not create a duplicate event when googleEventId already exists', async () => {
    bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CONFIRMADA', googleEventId: 'evt-existing' } as any);
    redis.del.mockResolvedValue(1);

    await service.confirmAndSync('booking-1');

    expect(calendar.createEvent).not.toHaveBeenCalled();
  });

  it('should throw for cancelled/completed bookings', async () => {
    bookingsRepo.findById.mockResolvedValue({ ...mockBooking, status: 'CANCELADA' } as any);

    await expect(service.confirmAndSync('booking-1')).rejects.toThrow(BadRequestException);
  });

  it('should retry pending syncs and report counts', async () => {
    bookingsRepo.findPendingCalendarSync.mockResolvedValue([
      { ...mockBooking, id: 'b1', status: 'CONFIRMADA', calendarSync: 'PENDING' } as any,
      { ...mockBooking, id: 'b2', status: 'CONFIRMADA', calendarSync: 'FAILED' } as any,
    ]);
    calendar.createEvent
      .mockResolvedValueOnce('evt-1')
      .mockResolvedValueOnce(null);

    const result = await service.syncPending();

    expect(result).toEqual({ synced: 1, failed: 1 });
    expect(bookingsRepo.update).toHaveBeenCalledWith('b1', { googleEventId: 'evt-1', calendarSync: 'SYNCED' } as any);
    expect(bookingsRepo.update).toHaveBeenCalledWith('b2', { calendarSync: 'FAILED' } as any);
  });
});
