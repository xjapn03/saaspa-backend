import { execSync } from 'child_process';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module';
import { TRUSTED_PROXY_HOPS, applyProxyTrust } from '../../src/common/http/proxy-trust';
import { PrismaService } from '../../src/database/prisma.service';

/**
 * Finding J-03: with `trust proxy: true` Express reads the **leftmost**
 * X-Forwarded-For entry, which the client writes, so the caller could rotate the
 * 20 requests/minute bucket of POST /api/chat with one header. Nginx appends the
 * real address at the end of that header (`$proxy_add_x_forwarded_for`), so the
 * backend trusts only the first hop and reads the value Nginx appended.
 *
 * The app is built exactly like main.ts (`applyProxyTrust`), and the header
 * carries what a client would send plus what Nginx would append.
 */
describe('Rate limit behind the proxy (e2e)', () => {
  const CHAT_LIMIT = 20;

  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fetchSpy: jest.SpyInstance;
  const createdConversations = new Set<string>();

  const chatAs = (forgedClientAddress: string, appendedAddress = '127.0.0.1') =>
    request(app.getHttpServer())
      .post('/api/chat')
      .set('X-Forwarded-For', `${forgedClientAddress}, ${appendedAddress}`)
      .send({ message: { text: 'Hola' } });

  const chat = (forgedClientAddress: string) => chatAs(forgedClientAddress);

  /** Turn token this backend forwarded to saaspa-IA on the last turn. */
  const forwardedTurnToken = (): string => {
    const call = fetchSpy.mock.calls.find((args) => String(args[0]).includes('/api/v1/chat'));
    const headers = (call?.[1] as { headers?: Record<string, string> } | undefined)?.headers ?? {};
    return String(headers.Authorization ?? '').replace(/^Bearer\s+/i, '');
  };

  /** Payload of the forwarded turn token, without verifying the signature. */
  const forwardedTokenPayload = (): any =>
    JSON.parse(Buffer.from(forwardedTurnToken().split('.')[1], 'base64url').toString('utf8'));

  const track = (response: request.Response) => {
    if (typeof response.body?.conversationId === 'string') {
      createdConversations.add(response.body.conversationId);
    }
  };

  beforeAll(async () => {
    execSync('npx prisma migrate deploy', { stdio: 'pipe' });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix(app.get(ConfigService).get<string>('API_PREFIX') || 'api');
    applyProxyTrust(app);
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
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterAll(async () => {
    if (createdConversations.size > 0) {
      await prisma.chatConversationState.deleteMany({
        where: { conversationId: { in: [...createdConversations] } },
      });
    }
    fetchSpy.mockRestore();
    await app.close();
  });

  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ turnId: 'ia-turn', reply: { text: 'ok' } }),
    } as never);
  });

  it('keeps a single bucket per real client when the client injects X-Forwarded-For', async () => {
    expect(TRUSTED_PROXY_HOPS).toBe(1);

    for (let i = 1; i <= CHAT_LIMIT; i++) {
      const allowed = await chat(`10.0.0.${i}`);
      track(allowed);
      expect(allowed.status).toBe(200);
    }

    // A brand new forged prefix must not open a new bucket: the limit belongs
    // to the address Nginx appended, not to the value the client invented.
    const throttled = await chat('10.0.0.250');
    expect(throttled.status).toBe(429);
  }, 60000);

  it('stamps the turn token with the appended address, never the forged prefix', async () => {
    // A fresh appended address, so this test owns its throttler bucket.
    const appended = '203.0.113.9';

    const first = await chatAs('10.0.0.7', appended);
    track(first);
    expect(first.status).toBe(200);
    expect(forwardedTokenPayload().clientIp).toBe(appended);

    fetchSpy.mockClear();
    const second = await chatAs('10.0.0.8', appended);
    track(second);
    expect(second.status).toBe(200);
    const payload = forwardedTokenPayload();

    // The same real client (the address the trusted hop appended) despite a
    // different forged prefix, and never the value the client invented: that is
    // the very address the throttler buckets on in the test above.
    expect(payload.clientIp).toBe(appended);
    expect(payload.clientIp).not.toBe('10.0.0.8');
  });
});
