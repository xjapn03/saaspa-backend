import { execSync } from 'child_process';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ACCESS_COOKIE } from '../../src/common/auth/cookies';
import { RedisService } from '../../src/common/redis/redis.service';
import { BookingsService } from '../../src/modules/bookings/bookings.service';
import { PrismaService } from '../../src/database/prisma.service';

/**
 * Joint triage B-01 at HTTP level: a booking that never paid must stop blocking
 * its slot once the payment window closes (and end up as EXPIRADA), and one user
 * must not be able to hold several pending bookings at the same time. The app is
 * built like main.ts and runs against the real database and Redis.
 */
describe('Pending payment expiry (e2e)', () => {
  const EMAIL = 'pending-expiry-e2e@test.com';
  const PASSWORD = 'password123';
  const SERVICE_SLUG = 'pending-expiry-e2e-service';

  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let bookingsService: BookingsService;
  let sessionCookie = '';
  let userId = '';
  let serviceId = '';
  let pendingCap = 2;
  let ttlMinutes = 30;

  const cookieValue = (response: request.Response, name: string): string => {
    const cookies = (response.headers['set-cookie'] as unknown as string[]) || [];
    const cookie = cookies.find((value) => value.startsWith(`${name}=`));
    return cookie ? cookie.split(';')[0].slice(name.length + 1) : '';
  };

  /** Target day, two days ahead, in the server local time zone. */
  const targetDay = () => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    const yyyy = date.getFullYear();
    const mm = `0${date.getMonth() + 1}`.slice(-2);
    const dd = `0${date.getDate()}`.slice(-2);
    return {
      dateKey: `${yyyy}-${mm}-${dd}`,
      year: yyyy,
      month: date.getMonth(),
      day: date.getDate(),
    };
  };

  /** Business hours start at 08:00 local, so these are valid slot instants. */
  const slotAt = (hour: number): Date => {
    const { year, month, day } = targetDay();
    return new Date(year, month, day, hour, 0, 0);
  };

  const slots = async (): Promise<string[]> => {
    const response = await request(app.getHttpServer())
      .get('/api/bookings/slots')
      .query({ serviceId, date: targetDay().dateKey });

    return response.body as string[];
  };

  const createBooking = (hour: number) =>
    request(app.getHttpServer())
      .post('/api/bookings')
      .set('Cookie', sessionCookie)
      .send({ serviceId, startTime: slotAt(hour).toISOString() });

  const lockKeyOf = (start: Date) =>
    `slot:${start.toISOString().split('T')[0]}:${start.toISOString()}`;

  beforeAll(async () => {
    execSync('npx prisma migrate deploy', { stdio: 'pipe' });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(app.get(ConfigService).get<string>('API_PREFIX') || 'api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    bookingsService = app.get(BookingsService);

    const config = app.get(ConfigService);
    pendingCap = Number(config.get('BOOKING_MAX_PENDING_PER_USER') ?? 2);
    ttlMinutes = Number(config.get('BOOKING_PAYMENT_TTL_MINUTES') ?? 30);

    const service = await prisma.service.create({
      data: {
        name: 'Pending expiry E2E',
        slug: SERVICE_SLUG,
        description: 'Temporary service for the pending payment expiry spec',
        price: 100000,
        duration: 60,
        isActive: true,
      },
    });
    serviceId = service.id;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: EMAIL, firstName: 'Pendiente', lastName: 'Test', password: PASSWORD });

    // Login requires a verified email; this fixture is verified directly so the
    // spec stays focused on the payment window.
    const user = await prisma.user.update({
      where: { email: EMAIL },
      data: { emailVerified: true },
    });
    userId = user.id;

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    sessionCookie = `${ACCESS_COOKIE}=${cookieValue(login, ACCESS_COOKIE)}`;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { userId } });
    await prisma.service.deleteMany({ where: { slug: SERVICE_SLUG } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await app.close();
  });

  it('stops blocking the slot when the payment window closes and marks it EXPIRADA', async () => {
    const start = slotAt(10);

    const created = await createBooking(10);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('PENDIENTE_PAGO');

    // The booking, not the Redis hold, is what keeps the slot busy from now on.
    await redis.del(lockKeyOf(start));
    expect(await slots()).not.toContain(start.toISOString());

    // The payment window closes: the slot is free even before the sweep runs.
    await prisma.booking.update({
      where: { id: created.body.id },
      data: { createdAt: new Date(Date.now() - (ttlMinutes + 1) * 60000) },
    });
    expect(await slots()).toContain(start.toISOString());

    const sweep = await bookingsService.expireOverduePendingBookings();
    expect(sweep.expired).toBeGreaterThanOrEqual(1);

    const expired = await prisma.booking.findUnique({ where: { id: created.body.id } });
    expect(expired?.status).toBe('EXPIRADA');

    // The freed slot can be booked again.
    const again = await createBooking(10);
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(created.body.id);
  });

  it('rejects a user that already holds the maximum number of pending bookings', async () => {
    // Clean slate: the previous test leaves a pending booking behind.
    const leftover = await prisma.booking.findMany({
      where: { userId, status: 'PENDIENTE_PAGO' },
      select: { startTime: true },
    });
    for (const booking of leftover) await redis.del(lockKeyOf(booking.startTime));
    await prisma.booking.deleteMany({ where: { userId, status: 'PENDIENTE_PAGO' } });

    // Two hours apart, so the bookings do not overlap.
    const hours = Array.from({ length: pendingCap + 1 }, (_, index) => 10 + index * 2);

    for (const hour of hours.slice(0, pendingCap)) {
      const allowed = await createBooking(hour);
      expect(allowed.status).toBe(201);
      expect(allowed.body.status).toBe('PENDIENTE_PAGO');
    }

    const rejected = await createBooking(hours[pendingCap]);
    expect(rejected.status).toBe(409);

    const pending = await prisma.booking.count({
      where: { userId, status: 'PENDIENTE_PAGO' },
    });
    expect(pending).toBe(pendingCap);
  });
});
