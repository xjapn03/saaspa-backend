import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { IssueTurnTokenInput } from '../../src/modules/internal/interfaces/turn-token-payload';
import { TurnTokenService } from '../../src/modules/internal/turn-token.service';

const OFFSET_ISO = new RegExp('^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[+-][0-9]{2}:[0-9]{2}$');

const CATEGORY_ID = '5b1f6f4e-1111-4222-8333-444455556666';
const SERVICE_ID = '9a7c2f10-1111-4222-8333-444455556666';
const SERVICE_SLUG = 'e2e-servicio-interno';
const SERVICE_NAME = 'E2E Servicio Interno';

describe('Internal API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let turnTokens: TurnTokenService;
  let jwtService: JwtService;
  let internalApiKey: string;
  let tenantId: string;
  let turnTokenKid: string;
  let turnTokenIssuer: string;
  let turnTokenAudience: string;
  let turnTokenPrivateKey: string;

  beforeAll(async () => {
    execSync('npx prisma migrate deploy', { stdio: 'pipe' });

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    // main.ts applies the global prefix; it has to be reproduced here.
    app.setGlobalPrefix(app.get(ConfigService).get<string>('API_PREFIX') || 'api');
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
    turnTokens = app.get(TurnTokenService);
    jwtService = app.get(JwtService);

    const config = app.get(ConfigService);
    internalApiKey = config.get<string>('INTERNAL_API_KEY') as string;
    tenantId = config.get<string>('TENANT_ID') as string;
    turnTokenKid = config.get<string>('TURN_TOKEN_KID') as string;
    turnTokenIssuer = config.get<string>('TURN_TOKEN_ISSUER') || 'saaspa-backend';
    turnTokenAudience = config.get<string>('TURN_TOKEN_AUDIENCE') || 'saaspa-ia';

    const rawKey = config.get<string>('TURN_TOKEN_PRIVATE_KEY') as string;
    turnTokenPrivateKey = rawKey.includes('-----BEGIN')
      ? rawKey.split(String.fromCharCode(92) + 'n').join(String.fromCharCode(10))
      : Buffer.from(rawKey, 'base64').toString('utf8');

    await prisma.service.deleteMany({ where: { id: SERVICE_ID } });
    await prisma.category.upsert({
      where: { id: CATEGORY_ID },
      update: { isActive: true },
      create: { id: CATEGORY_ID, name: 'E2E Categoria Interna', slug: 'e2e-categoria-interna' },
    });
    await prisma.service.create({
      data: {
        id: SERVICE_ID,
        name: SERVICE_NAME,
        slug: SERVICE_SLUG,
        description: 'Fixture de la API interna',
        price: 150000,
        duration: 60,
        isActive: true,
        isFeatured: false,
        categoryId: CATEGORY_ID,
      },
    });
  });

  afterAll(async () => {
    await prisma.service.deleteMany({ where: { id: SERVICE_ID } });
    await prisma.category.deleteMany({ where: { id: CATEGORY_ID } });
    await app.close();
  });

  const headers = (token: string) => ({
    'x-internal-api-key': internalApiKey,
    authorization: `Bearer ${token}`,
  });

  const turnToken = (overrides: Partial<IssueTurnTokenInput> = {}) =>
    turnTokens.issue({
      turnId: randomUUID(),
      conversationId: 'e2e-conv',
      channel: 'WEB_WIDGET',
      agent: 'CLIENTAS',
      ...overrides,
    });

  const foreignTenantToken = () =>
    jwtService.sign(
      { tenantId: 'otro', conversationId: 'e2e-conv', channel: 'WEB_WIDGET', agent: 'CLIENTAS' },
      {
        privateKey: turnTokenPrivateKey,
        algorithm: 'ES256',
        keyid: turnTokenKid,
        issuer: turnTokenIssuer,
        audience: turnTokenAudience,
        jwtid: randomUUID(),
      },
    );

  describe('GET /api/internal/v1/services', () => {
    it('returns 401 without the service key', async () => {
      const response = await request(app.getHttpServer()).get('/api/internal/v1/services');

      expect(response.status).toBe(401);
    });

    it('returns 401 with a wrong service key', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/internal/v1/services')
        .set('x-internal-api-key', 'wrong-key')
        .set('authorization', `Bearer ${turnToken()}`);

      expect(response.status).toBe(401);
    });

    it('returns 401 when the bearer token is a session token (HS256)', async () => {
      const sessionToken = jwtService.sign(
        { sub: 'user-1', email: 'e2e@test.com', role: 'CLIENTE' },
        {
          secret: 'session-secret',
          algorithm: 'HS256',
          keyid: turnTokenKid,
          issuer: turnTokenIssuer,
          audience: turnTokenAudience,
        },
      );

      const response = await request(app.getHttpServer())
        .get('/api/internal/v1/services')
        .set(headers(sessionToken));

      expect(response.status).toBe(401);
    });

    it('returns 403 for a turn token of another tenant', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/internal/v1/services')
        .set(headers(foreignTenantToken()));

      expect(response.status).toBe(403);
      expect(tenantId).toBeDefined();
    });

    it('returns the active catalog mapped to the contract shape', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/internal/v1/services')
        .set(headers(turnToken()));

      expect(response.status).toBe(200);
      expect(typeof response.body.total).toBe('number');

      const service = response.body.data.find((item: any) => item.id === SERVICE_ID);
      expect(service).toBeDefined();
      expect(service.slug).toBe(SERVICE_SLUG);
      expect(service.name).toBe(SERVICE_NAME);
      expect(service.price).toBe(150000);
      expect(service.duration).toBe(60);
      expect(service.category).toEqual({
        id: CATEGORY_ID,
        name: 'E2E Categoria Interna',
        slug: 'e2e-categoria-interna',
      });
      expect(service.categoryRel).toBeUndefined();
      expect(service.createdAt).toBeUndefined();
    });

    it('excludes non featured services when featured=true', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/internal/v1/services?featured=true')
        .set(headers(turnToken()));

      expect(response.status).toBe(200);
      expect(response.body.data.find((item: any) => item.id === SERVICE_ID)).toBeUndefined();
    });

    it('rejects a limit above the contract maximum', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/internal/v1/services?limit=500')
        .set(headers(turnToken()));

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/internal/v1/services/:idOrSlug', () => {
    it('resolves by id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/internal/v1/services/${SERVICE_ID}`)
        .set(headers(turnToken()));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(SERVICE_ID);
      expect(response.body.category.id).toBe(CATEGORY_ID);
    });

    it('resolves by slug', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/internal/v1/services/${SERVICE_SLUG}`)
        .set(headers(turnToken()));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(SERVICE_ID);
    });

    it('returns 404 for an unknown service', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/internal/v1/services/no-existe')
        .set(headers(turnToken()));

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/internal/v1/availability', () => {
    it('returns slots with an explicit offset and the tenant time zone', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/internal/v1/availability?serviceId=${SERVICE_SLUG}&date=2027-03-15`)
        .set(headers(turnToken()));

      expect(response.status).toBe(200);
      expect(response.body.serviceId).toBe(SERVICE_ID);
      expect(response.body.date).toBe('2027-03-15');
      expect(response.body.timezone).toBe('America/Bogota');
      expect(response.body.slots.length).toBeGreaterThan(0);

      const slot = response.body.slots[0];
      expect(OFFSET_ISO.test(slot.start)).toBe(true);
      expect(OFFSET_ISO.test(slot.end)).toBe(true);
      expect(new Date(slot.end).getTime() - new Date(slot.start).getTime()).toBe(60 * 60000);
    });

    it('rejects an impossible calendar date', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/internal/v1/availability?serviceId=${SERVICE_SLUG}&date=2027-02-31`)
        .set(headers(turnToken()));

      expect(response.status).toBe(400);
    });

    it('returns 404 for an unknown service', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/internal/v1/availability?serviceId=3f1a1f6e-1111-4222-8333-444455556666&date=2027-03-15')
        .set(headers(turnToken()));

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/internal/v1/me/bookings', () => {
    const EMAIL = 'me-bookings-e2e@test.com';
    const OTHER_EMAIL = 'me-bookings-other-e2e@test.com';

    let userId = '';
    let otherUserId = '';
    let otherBookingId = '';
    const bookingIds: string[] = [];

    const createBooking = (ownerId: string, isoStart: string, status: string) =>
      prisma.booking.create({
        data: {
          user: { connect: { id: ownerId } },
          service: { connect: { id: SERVICE_ID } },
          startTime: new Date(isoStart),
          endTime: new Date(new Date(isoStart).getTime() + 60 * 60000),
          status: status as never,
        },
        select: { id: true },
      });

    beforeAll(async () => {
      const client = await prisma.user.create({
        data: {
          email: EMAIL,
          firstName: 'Mia',
          lastName: 'Citas',
          passwordHash: 'password123',
        },
      });
      userId = client.id;

      const other = await prisma.user.create({
        data: {
          email: OTHER_EMAIL,
          firstName: 'Otra',
          lastName: 'Clienta',
          passwordHash: 'password123',
        },
      });
      otherUserId = other.id;

      // `startTime` desc is the listing order, so these are returned newest first.
      bookingIds.push((await createBooking(userId, '2027-05-01T13:00:00Z', 'CONFIRMADA')).id);
      bookingIds.push((await createBooking(userId, '2027-06-01T13:00:00Z', 'EXPIRADA')).id);
      bookingIds.push((await createBooking(userId, '2027-07-01T13:00:00Z', 'PAGO_TARDE')).id);
      otherBookingId = (await createBooking(otherUserId, '2027-08-01T13:00:00Z', 'CANCELADA')).id;
    });

    afterAll(async () => {
      await prisma.booking.deleteMany({ where: { id: { in: [...bookingIds, otherBookingId] } } });
      await prisma.user.deleteMany({ where: { email: { in: [EMAIL, OTHER_EMAIL] } } });
    });

    it('returns 403 for an anonymous turn', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/internal/v1/me/bookings')
        .set(headers(turnToken()));

      expect(response.status).toBe(403);
    });

    it('returns only the client bookings in the contract shape, EXPIRADA and PAGO_TARDE included', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/internal/v1/me/bookings')
        .set(headers(turnToken({ userId, role: 'CLIENTE', channel: 'WEB_LOGGED' })));

      expect(response.status).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual(['bookings', 'timezone']);
      expect(response.body.timezone).toBe('America/Bogota');

      const bookings = response.body.bookings;
      expect(bookings.map((booking) => booking.status)).toEqual(['PAGO_TARDE', 'EXPIRADA', 'CONFIRMADA']);
      expect(bookings.some((booking) => booking.id === otherBookingId)).toBe(false);

      for (const booking of bookings) {
        expect(Object.keys(booking).sort()).toEqual([
          'end',
          'id',
          'price',
          'serviceId',
          'serviceName',
          'start',
          'status',
        ]);
        expect(booking.serviceId).toBe(SERVICE_ID);
        expect(booking.serviceName).toBe(SERVICE_NAME);
        expect(booking.price).toBe(150000);
        expect(OFFSET_ISO.test(booking.start)).toBe(true);
        expect(OFFSET_ISO.test(booking.end)).toBe(true);
      }

      // No PII and no internals ever leave: the shape is exact, so this is a
      // double check against a projection regression.
      const body = JSON.stringify(response.body);
      for (const leaked of [EMAIL, OTHER_EMAIL, 'idempotencyKey', 'googleEventId', 'notes']) {
        expect(body).not.toContain(leaked);
      }
    });

    it('paginates with the requested page and limit', async () => {
      const firstPage = await request(app.getHttpServer())
        .get('/api/internal/v1/me/bookings?page=1&limit=2')
        .set(headers(turnToken({ userId, role: 'CLIENTE', channel: 'WEB_LOGGED' })));

      expect(firstPage.status).toBe(200);
      expect(firstPage.body.bookings).toHaveLength(2);

      const secondPage = await request(app.getHttpServer())
        .get('/api/internal/v1/me/bookings?page=2&limit=2')
        .set(headers(turnToken({ userId, role: 'CLIENTE', channel: 'WEB_LOGGED' })));

      expect(secondPage.status).toBe(200);
      expect(secondPage.body.bookings).toHaveLength(1);
      expect(secondPage.body.bookings[0].id).not.toBe(firstPage.body.bookings[0].id);
    });

    it('rejects a limit above the contract maximum', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/internal/v1/me/bookings?limit=51')
        .set(headers(turnToken({ userId, role: 'CLIENTE', channel: 'WEB_LOGGED' })));

      expect(response.status).toBe(400);
    });
  });
});
