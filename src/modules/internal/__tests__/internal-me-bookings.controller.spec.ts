import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { BookingsService } from '../../bookings/bookings.service';
import { InternalAuthGuard } from '../guards/internal-auth.guard';
import { InternalMeBookingsController } from '../internal-me-bookings.controller';
import { TurnTokenPayload } from '../interfaces/turn-token-payload';

/** `start`/`end` must carry an explicit UTC offset, like /availability. */
const OFFSET_ISO = new RegExp('^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[+-][0-9]{2}:[0-9]{2}$');

describe('InternalMeBookingsController', () => {
  let controller: InternalMeBookingsController;
  let bookingsService: DeepMockProxy<BookingsService>;

  const turn = (overrides: Partial<TurnTokenPayload> = {}): TurnTokenPayload => ({
    iss: 'saaspa-backend',
    aud: 'saaspa-ia',
    iat: 0,
    exp: 0,
    jti: 'turn-1',
    tenantId: 'kamerinos',
    conversationId: 'conv-1',
    channel: 'WEB_LOGGED',
    agent: 'CLIENTAS',
    userId: 'user-1',
    role: 'CLIENTE',
    ...overrides,
  });

  const page = (rows: unknown[]) => ({ data: rows, total: rows.length, page: 1, limit: 20, totalPages: 1 });

  /** A repository row: it carries PII and internals the contract must not return. */
  const booking = (overrides: Record<string, unknown> = {}) => ({
    id: 'bk-1',
    userId: 'user-1',
    serviceId: 'svc-1',
    startTime: new Date('2027-03-15T13:00:00Z'),
    endTime: new Date('2027-03-15T14:00:00Z'),
    status: 'CONFIRMADA',
    googleEventId: 'google-evt-1',
    calendarSync: 'SYNCED',
    notes: 'nota privada',
    idempotencyKey: 'turn-x:bookings.create',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    user: { firstName: 'Ana', lastName: 'Test', email: 'ana@example.com', phone: '3001112222' },
    service: { name: 'Facial Premium', duration: 60, price: 150000 },
    ...overrides,
  });

  beforeEach(async () => {
    bookingsService = mockDeep<BookingsService>();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalMeBookingsController],
      providers: [
        { provide: BookingsService, useValue: bookingsService },
        { provide: ConfigService, useValue: new ConfigService({ TENANT_TIMEZONE: 'America/Bogota' }) },
      ],
    })
      // The controller declares @UseGuards(InternalAuthGuard); the guard has its own
      // suite, so here it is replaced by a stub.
      .overrideGuard(InternalAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<InternalMeBookingsController>(InternalMeBookingsController);
  });

  describe('myBookings', () => {
    it('rejects an anonymous turn with 403', async () => {
      await expect(controller.myBookings(turn({ userId: undefined }), {})).rejects.toThrow(ForbiddenException);
      expect(bookingsService.findAll).not.toHaveBeenCalled();
    });

    it('takes the subject from the turn token and forwards the pagination', async () => {
      bookingsService.findAll.mockResolvedValue(page([]) as never);

      await controller.myBookings(turn(), { page: 2, limit: 5 });

      expect(bookingsService.findAll).toHaveBeenCalledWith({ userId: 'user-1', page: 2, limit: 5 });
    });

    it('with upcoming=true filters from now and sorts soonest first', async () => {
      bookingsService.findAll.mockResolvedValue(page([]) as never);

      await controller.myBookings(turn(), { upcoming: 'true' });

      expect(bookingsService.findAll).toHaveBeenCalledWith({
        userId: 'user-1',
        from: expect.any(Date),
        sortBy: 'startTime',
        order: 'asc',
        page: undefined,
        limit: undefined,
      });
    });

    it('returns exactly the contract shape, with offset ISO instants', async () => {
      bookingsService.findAll.mockResolvedValue(page([booking()]) as never);

      const result = await controller.myBookings(turn(), {});

      expect(Object.keys(result).sort()).toEqual(['bookings', 'hasMore', 'timezone']);
      expect(result.timezone).toBe('America/Bogota');
      expect(result.hasMore).toBe(false);

      const [first] = result.bookings;
      expect(Object.keys(first).sort()).toEqual([
        'end',
        'id',
        'price',
        'serviceId',
        'serviceName',
        'start',
        'status',
      ]);
      expect(first.id).toBe('bk-1');
      expect(first.serviceId).toBe('svc-1');
      expect(first.serviceName).toBe('Facial Premium');
      expect(first.price).toBe(150000);
      // 2027-03-15T13:00:00Z is 08:00 in Bogota, and COT is -05 all year.
      expect(first.start).toBe('2027-03-15T08:00:00-05:00');
      expect(first.end).toBe('2027-03-15T09:00:00-05:00');
      expect(OFFSET_ISO.test(first.start)).toBe(true);
      expect(first.status).toBe('CONFIRMADA');
    });

    it('signals with hasMore that the page is not the whole list', async () => {
      bookingsService.findAll.mockResolvedValue({
        data: [booking()],
        total: 21,
        page: 1,
        limit: 20,
        totalPages: 2,
      } as never);

      const result = await controller.myBookings(turn(), {});

      expect(result.hasMore).toBe(true);
    });

    it('keeps EXPIRADA and PAGO_TARDE and never returns PII or internals', async () => {
      bookingsService.findAll.mockResolvedValue(
        page([
          booking({ id: 'bk-exp', status: 'EXPIRADA' }),
          booking({ id: 'bk-late', status: 'PAGO_TARDE', service: { name: 'Masaje', duration: 45, price: 90000 } }),
        ]) as never,
      );

      const result = await controller.myBookings(turn(), {});

      expect(result.bookings.map((b) => b.status)).toEqual(['EXPIRADA', 'PAGO_TARDE']);

      const body = JSON.stringify(result);
      for (const leaked of ['ana@example.com', '3001112222', 'nota privada', 'google-evt-1', 'turn-x:bookings.create', 'Ana']) {
        expect(body).not.toContain(leaked);
      }
    });
  });
});