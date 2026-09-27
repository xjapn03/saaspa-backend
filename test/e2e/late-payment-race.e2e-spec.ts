import { execSync } from 'child_process';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import { createHash } from 'crypto';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ACCESS_COOKIE } from '../../src/common/auth/cookies';
import { EmailService } from '../../src/common/email/email.service';
import { RedisService } from '../../src/common/redis/redis.service';
import { BookingsService } from '../../src/modules/bookings/bookings.service';
import { PrismaService } from '../../src/database/prisma.service';

/**
 * H-01 at HTTP level: a Wompi payment that arrives after the payment window
 * closed must never lose money nor double-book a slot. Both races are replayed
 * against the real database and Redis, with a webhook signed exactly like Wompi
 * signs it.
 */
describe('Late payment race (e2e, H-01)', () => {
  const EMAIL_A = 'late-payment-race-a-e2e@test.com';
  const EMAIL_B = 'late-payment-race-b-e2e@test.com';
  const PASSWORD = 'password123';
  const SERVICE_SLUG = 'late-payment-race-e2e-service';
  const AMOUNT_IN_CENTS = 3000000;

  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let bookingsService: BookingsService;
  let emailService: EmailService;
  let eventsKey = 'events_test_xxx';
  let ttlMinutes = 30;
  let serviceId = '';
  let cookieA = '';
  let cookieB = '';
  let userA = '';
  let userB = '';
  const paymentIds: string[] = [];

  const cookieValue = (response: request.Response, name: string): string => {
    const cookies = (response.headers['set-cookie'] as unknown as string[]) || [];
    const cookie = cookies.find((value) => value.startsWith(`${name}=`));
    return cookie ? cookie.split(';')[0].slice(name.length + 1) : '';
  };

  /** Target day, three days ahead, in the server local time zone. */
  const targetDay = () => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    const yyyy = date.getFullYear();
    const mm = `0${date.getMonth() + 1}`.slice(-2);
    const dd = `0${date.getDate()}`.slice(-2);
    return { dateKey: `${yyyy}-${mm}-${dd}`, year: yyyy, month: date.getMonth(), day: date.getDate() };
  };

  const slotAt = (hour: number): Date => {
    const { year, month, day } = targetDay();
    return new Date(year, month, day, hour, 0, 0);
  };

  const lockKeyOf = (start: Date) => `slot:${start.toISOString().split('T')[0]}:${start.toISOString()}`;

  const createBooking = (cookie: string, hour: number) =>
    request(app.getHttpServer())
      .post('/api/bookings')
      .set('Cookie', cookie)
      .send({ serviceId, startTime: slotAt(hour).toISOString() });

  const initPayment = (cookie: string, bookingId: string) =>
    request(app.getHttpServer())
      .post('/api/payments/init')
      .set('Cookie', cookie)
      .send({ bookingId, type: 'ABONO' });

  /** Backdates the booking so its payment window is already closed. */
  const closeWindow = (bookingId: string) =>
    prisma.booking.update({
      where: { id: bookingId },
      data: { createdAt: new Date(Date.now() - (ttlMinutes + 1) * 60000) },
    });

  /** Signs the webhook exactly like WompiPaymentProvider verifies it. */
  const webhook = (reference: string, transactionId: string) => {
    const status = 'APPROVED';
    const timestamp = Date.now();
    const checksum = createHash('sha256')
      .update(`${transactionId}${status}${AMOUNT_IN_CENTS}${timestamp}${eventsKey}`)
      .digest('hex')
      .toUpperCase();

    return request(app.getHttpServer())
      .post('/api/payments/webhook')
      .set('x-event-checksum', checksum)
      .send({
        event: 'transaction.updated',
        data: {
          transaction: { id: transactionId, status, reference, amount_in_cents: AMOUNT_IN_CENTS },
        },
        timestamp,
      });
  };

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
    emailService = app.get(EmailService);

    const config = app.get(ConfigService);
    ttlMinutes = Number(config.get('BOOKING_PAYMENT_TTL_MINUTES') ?? 30);
    eventsKey = config.get<string>('WOMPI_EVENTS_KEY') || 'events_test_xxx';

    // The assertions are on the persisted state; a real SendGrid send adds
    // latency and can fail, so the two late-payment mails are stubbed.
    jest.spyOn(emailService, 'sendLatePaymentClientNotice').mockResolvedValue(undefined);
    jest.spyOn(emailService, 'sendAdminLatePaymentNotification').mockResolvedValue(undefined);

    const service = await prisma.service.create({
      data: {
        name: 'Late payment race E2E',
        slug: SERVICE_SLUG,
        description: 'Temporary service for the late payment race spec',
        price: 100000,
        duration: 60,
        isActive: true,
      },
    });
    serviceId = service.id;

    const signIn = async (email: string): Promise<{ cookie: string; userId: string }> => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, firstName: 'Pago', lastName: 'Tarde', password: PASSWORD });
      const user = await prisma.user.update({ where: { email }, data: { emailVerified: true } });
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: PASSWORD });
      return { cookie: `${ACCESS_COOKIE}=${cookieValue(login, ACCESS_COOKIE)}`, userId: user.id };
    };

    const a = await signIn(EMAIL_A);
    cookieA = a.cookie;
    userA = a.userId;
    const b = await signIn(EMAIL_B);
    cookieB = b.cookie;
    userB = b.userId;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: paymentIds } } });
    await prisma.payment.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.booking.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.service.deleteMany({ where: { slug: SERVICE_SLUG } });
    await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
    await app.close();
  });

  it('does not throw and parks the booking when the payment arrives after the sweep expired it', async () => {
    const created = await createBooking(cookieA, 9);
    expect(created.status).toBe(201);
    const bookingId = created.body.id;

    const payment = await initPayment(cookieA, bookingId);
    expect(payment.status).toBe(201);
    const reference = payment.body.reference;
    const stored = await prisma.payment.findFirst({ where: { wompiReference: reference } });
    paymentIds.push(stored!.id);

    // The payment window closes and the sweep normalises the booking.
    await closeWindow(bookingId);
    await bookingsService.expireOverduePendingBookings();
    const expired = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(expired?.status).toBe('EXPIRADA');

    const response = await webhook(reference, 'txn-late-window');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(booking?.status).toBe('PAGO_TARDE');

    const approved = await prisma.payment.findUnique({ where: { id: stored!.id } });
    expect(approved?.status).toBe('APROBADO');
    const metadata = approved?.metadata as any;
    expect(metadata?.reviewRequired).toBe(true);
    expect(metadata?.reviewReason).toBe('NEEDS_SLOT');

    expect(emailService.sendLatePaymentClientNotice).toHaveBeenCalled();
    expect(emailService.sendAdminLatePaymentNotification).toHaveBeenCalled();

    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'payments', entityId: stored!.id, action: 'PAYMENT_LATE_WINDOW_CLOSED' },
    });
    expect(audit).not.toBeNull();
  });

  it('does not confirm a second booking when the freed slot was taken again', async () => {
    const start = slotAt(13);
    const first = await createBooking(cookieA, 13);
    expect(first.status).toBe(201);
    const firstId = first.body.id;

    const payment = await initPayment(cookieA, firstId);
    expect(payment.status).toBe(201);
    const reference = payment.body.reference;
    const stored = await prisma.payment.findFirst({ where: { wompiReference: reference } });
    paymentIds.push(stored!.id);

    // Window closes but the sweep has not run yet; another client takes the slot.
    await closeWindow(firstId);
    await redis.del(lockKeyOf(start));

    const second = await createBooking(cookieB, 13);
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(firstId);

    const response = await webhook(reference, 'txn-late-slot');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });

    const firstRow = await prisma.booking.findUnique({ where: { id: firstId } });
    const secondRow = await prisma.booking.findUnique({ where: { id: second.body.id } });
    expect(firstRow?.status).toBe('PAGO_TARDE');
    expect(secondRow?.status).toBe('PENDIENTE_PAGO');

    // Never two confirmed bookings for the same slot.
    const confirmed = await prisma.booking.count({
      where: { startTime: start, status: 'CONFIRMADA' },
    });
    expect(confirmed).toBe(0);

    const approved = await prisma.payment.findUnique({ where: { id: stored!.id } });
    expect((approved?.metadata as any)?.reviewReason).toBe('NEEDS_REVIEW');
  });
});
