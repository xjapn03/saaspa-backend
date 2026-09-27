import { Logger } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { BookingsService } from '../bookings.service';
import { EXPIRY_SWEEP_INTERVAL_MS } from '../booking.constants';
import { PendingPaymentExpiryScheduler } from '../pending-payment-expiry.scheduler';

describe('PendingPaymentExpiryScheduler', () => {
  let scheduler: PendingPaymentExpiryScheduler;
  let bookingsService: DeepMockProxy<BookingsService>;

  beforeEach(() => {
    jest.useFakeTimers();
    bookingsService = mockDeep<BookingsService>();
    bookingsService.expireOverduePendingBookings.mockResolvedValue({ expired: 0 });
    scheduler = new PendingPaymentExpiryScheduler(bookingsService);
  });

  afterEach(() => {
    scheduler.onModuleDestroy();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('sweeps once as soon as the app is up and then every interval', async () => {
    scheduler.onModuleInit();

    // The first pass waits for the next tick, so it runs after the app is up.
    await jest.advanceTimersByTimeAsync(0);
    expect(bookingsService.expireOverduePendingBookings).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(EXPIRY_SWEEP_INTERVAL_MS);
    expect(bookingsService.expireOverduePendingBookings).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(EXPIRY_SWEEP_INTERVAL_MS);
    expect(bookingsService.expireOverduePendingBookings).toHaveBeenCalledTimes(3);
  });

  it('stops sweeping when the module is destroyed', async () => {
    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);

    scheduler.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(EXPIRY_SWEEP_INTERVAL_MS);

    expect(bookingsService.expireOverduePendingBookings).toHaveBeenCalledTimes(1);
  });

  it('reports the number of expired bookings', async () => {
    bookingsService.expireOverduePendingBookings.mockResolvedValue({ expired: 3 });

    await expect(scheduler.sweep()).resolves.toEqual({ expired: 3 });
  });

  it('logs a failing sweep instead of throwing', async () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    bookingsService.expireOverduePendingBookings.mockRejectedValue(new Error('database down'));

    await expect(scheduler.sweep()).resolves.toEqual({ expired: 0 });
    expect(logError).toHaveBeenCalled();
  });
});
