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
});
