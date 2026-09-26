import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { DEFAULT_TIMEZONE, isValidCalendarDate, toOffsetIso } from '../../../common/time/timezone.util';
import { BookingsService } from '../../bookings/bookings.service';
import { ServicesService } from '../../services/services.service';
import { InternalAuthGuard } from '../guards/internal-auth.guard';
import { InternalAvailabilityController } from '../internal-availability.controller';

const UUID = '3f1a1f6e-5b1c-4a5e-9a0e-1b2c3d4e5f60';

describe('InternalAvailabilityController', () => {
  let controller: InternalAvailabilityController;
  let servicesService: DeepMockProxy<ServicesService>;
  let bookingsService: DeepMockProxy<BookingsService>;

  async function build(env: Record<string, string> = { TENANT_TIMEZONE: 'America/Bogota' }) {
    servicesService = mockDeep<ServicesService>();
    bookingsService = mockDeep<BookingsService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalAvailabilityController],
      providers: [
        { provide: ServicesService, useValue: servicesService },
        { provide: BookingsService, useValue: bookingsService },
        { provide: ConfigService, useValue: new ConfigService(env) },
      ],
    })
      // The controller declares @UseGuards(InternalAuthGuard); the guard has its own
      // suite, so here it is replaced by a stub.
      .overrideGuard(InternalAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InternalAvailabilityController>(InternalAvailabilityController);
  }

  const windowWith = (slots: { start: Date; end: Date }[]) => ({
    serviceId: UUID,
    date: '2026-10-01',
    slots,
  });

  beforeEach(async () => {
    await build();
  });

  describe('getAvailability', () => {
    it('returns slots with an explicit UTC offset and the time zone', async () => {
      servicesService.findById.mockResolvedValue({ id: UUID } as never);
      bookingsService.getAvailabilityWindow.mockResolvedValue(
        windowWith([
          { start: new Date('2026-10-01T13:00:00.000Z'), end: new Date('2026-10-01T14:15:00.000Z') },
        ]),
      );

      const result = await controller.getAvailability({ serviceId: UUID, date: '2026-10-01' });

      expect(bookingsService.getAvailabilityWindow).toHaveBeenCalledWith(UUID, '2026-10-01');
      expect(result).toEqual({
        serviceId: UUID,
        date: '2026-10-01',
        timezone: 'America/Bogota',
        slots: [{ start: '2026-10-01T08:00:00-05:00', end: '2026-10-01T09:15:00-05:00' }],
      });
    });

    it('accepts a slug and queries availability with the resolved uuid', async () => {
      servicesService.findBySlug.mockResolvedValue({ id: UUID, slug: 'facial-premium' } as never);
      bookingsService.getAvailabilityWindow.mockResolvedValue(windowWith([]));

      const result = await controller.getAvailability({ serviceId: 'facial-premium', date: '2026-10-01' });

      expect(servicesService.findBySlug).toHaveBeenCalledWith('facial-premium');
      expect(servicesService.findById).not.toHaveBeenCalled();
      expect(bookingsService.getAvailabilityWindow).toHaveBeenCalledWith(UUID, '2026-10-01');
      expect(result.serviceId).toBe(UUID);
      expect(result.slots).toEqual([]);
    });

    it('uses the default time zone when TENANT_TIMEZONE is not configured', async () => {
      await build({});
      servicesService.findById.mockResolvedValue({ id: UUID } as never);
      bookingsService.getAvailabilityWindow.mockResolvedValue(
        windowWith([
          { start: new Date('2026-10-01T13:00:00.000Z'), end: new Date('2026-10-01T14:15:00.000Z') },
        ]),
      );

      const result = await controller.getAvailability({ serviceId: UUID, date: '2026-10-01' });

      expect(result.timezone).toBe(DEFAULT_TIMEZONE);
      expect(result.slots[0].start).toBe('2026-10-01T08:00:00-05:00');
    });

    it('rejects an impossible calendar date without touching the data layer', async () => {
      await expect(controller.getAvailability({ serviceId: UUID, date: '2026-02-31' })).rejects.toThrow(
        BadRequestException,
      );

      expect(servicesService.findById).not.toHaveBeenCalled();
      expect(bookingsService.getAvailabilityWindow).not.toHaveBeenCalled();
    });

    it('rejects a malformed date', async () => {
      await expect(controller.getAvailability({ serviceId: UUID, date: '2026/10/01' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getAvailability({ serviceId: UUID, date: '2026-10-1' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

describe('timezone utils', () => {
  it('formats an instant in the tenant time zone with an explicit offset', () => {
    expect(toOffsetIso(new Date('2026-10-01T13:00:00.000Z'), 'America/Bogota')).toBe(
      '2026-10-01T08:00:00-05:00',
    );
  });

  it('formats UTC with +00:00 instead of GMT', () => {
    expect(toOffsetIso(new Date('2026-10-01T13:00:00.000Z'), 'UTC')).toBe('2026-10-01T13:00:00+00:00');
  });

  it('uses the local date when the instant falls on the previous day', () => {
    expect(toOffsetIso(new Date('2026-10-01T03:00:00.000Z'), 'America/Bogota')).toBe(
      '2026-09-30T22:00:00-05:00',
    );
  });

  describe('isValidCalendarDate', () => {
    it('accepts real dates', () => {
      expect(isValidCalendarDate('2026-10-01')).toBe(true);
      expect(isValidCalendarDate('2024-02-29')).toBe(true);
    });

    it('rejects impossible or malformed dates', () => {
      expect(isValidCalendarDate('2026-02-29')).toBe(false);
      expect(isValidCalendarDate('2026-04-31')).toBe(false);
      expect(isValidCalendarDate('2026-13-01')).toBe(false);
      expect(isValidCalendarDate('2026-10-1')).toBe(false);
      expect(isValidCalendarDate('2026/10/01')).toBe(false);
      expect(isValidCalendarDate('no-es-fecha')).toBe(false);
    });
  });
});
