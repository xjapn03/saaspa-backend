import { execSync } from 'child_process';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ACCESS_COOKIE } from '../../src/common/auth/cookies';
import { PrismaService } from '../../src/database/prisma.service';

/**
 * ADR 0008 / ADR 0012 point 4 at HTTP level: a retry with the same
 * `Idempotency-Key` returns the booking created by the first call instead of
 * creating a second one. The app is built like main.ts and runs against the real
 * database.
 */
describe('Booking idempotency (e2e)', () => {
  const EMAIL = 'booking-idempotency-e2e@test.com';
  const PASSWORD = 'password123';
  const SERVICE_SLUG = 'booking-idempotency-e2e-service';
  const IDEMPOTENCY_KEY = 'turn-e2e-1:crearCita';

  let app: INestApplication;
  let prisma: PrismaService;
  let sessionCookie = '';
  let userId = '';
  let serviceId = '';

  const cookieValue = (response: request.Response, name: string): string => {
    const cookies = (response.headers['set-cookie'] as unknown as string[]) || [];
    const cookie = cookies.find((value) => value.startsWith(`${name}=`));
    return cookie ? cookie.split(';')[0].slice(name.length + 1) : '';
  };

  /** Target day, two days ahead, in the server local time zone. */
  const slotAt = (hour: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0).toISOString();
  };

  const createBooking = (startTime: string, idempotencyKey?: string) => {
    const call = request(app.getHttpServer())
      .post('/api/bookings')
      .set('Cookie', sessionCookie)
      .send({ serviceId, startTime });

    return idempotencyKey ? call.set('Idempotency-Key', idempotencyKey) : call;
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

    const service = await prisma.service.create({
      data: {
        name: 'Booking idempotency E2E',
        slug: SERVICE_SLUG,
        description: 'Temporary service for the booking idempotency spec',
        price: 100000,
        duration: 60,
        isActive: true,
      },
    });
    serviceId = service.id;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: EMAIL, firstName: 'Idempotente', lastName: 'Test', password: PASSWORD });

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

  beforeEach(async () => {
    // Each test starts from a clean agenda so the pending bookings cap cannot
    // interfere with the idempotency assertions.
    await prisma.booking.deleteMany({ where: { userId } });
  });

  it('returns the booking of the first call when the same key is retried', async () => {
    const start = slotAt(10);

    const first = await createBooking(start, IDEMPOTENCY_KEY);
    expect(first.status).toBe(201);
    expect(first.body.status).toBe('PENDIENTE_PAGO');

    const retry = await createBooking(start, IDEMPOTENCY_KEY);
    expect(retry.status).toBe(201);
    expect(retry.body.id).toBe(first.body.id);

    // One row, and its key is the one the caller sent.
    const stored = await prisma.booking.findMany({ where: { idempotencyKey: IDEMPOTENCY_KEY } });
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(first.body.id);
    expect(await prisma.booking.count({ where: { userId, startTime: new Date(start) } })).toBe(1);
  });

  it('creates another booking when the key is different', async () => {
    const first = await createBooking(slotAt(12), 'turn-e2e-2:crearCita');
    const second = await createBooking(slotAt(14), 'turn-e2e-3:crearCita');

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
  });

  /**
   * Guard test: the cross-turn brake is the overlap check, not the idempotency
   * key (which is per turn by design, ADR 0008/0012). saaspa-IA's ADR leans on
   * this behavior: two equivalent turns must not produce two bookings, and the
   * second one has to fail with 409.
   */
  it('rejects a second booking of the same slot when the key is different', async () => {
    const start = slotAt(11);

    const first = await createBooking(start, 'turn-e2e-4:crearCita');
    const second = await createBooking(start, 'turn-e2e-5:crearCita');

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(await prisma.booking.count({ where: { userId, startTime: new Date(start) } })).toBe(1);
  });

  it('rejects a malformed Idempotency-Key with 400', async () => {
    const response = await createBooking(slotAt(16), 'clave con espacios');

    expect(response.status).toBe(400);
    expect(await prisma.booking.count({ where: { userId } })).toBe(0);
  });
});
