import { execSync } from 'child_process';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';
import { HANDOFF_ACTIVE_MESSAGE } from '../../src/modules/chat/chat.constants';

const UUID = new RegExp('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
const CONVERSATION_ID = new RegExp('^[0-9a-f]{32}$');

/**
 * HTTP level test of POST /api/chat. saaspa-IA is not running in this environment,
 * so global fetch is replaced by a fake assistant; everything else is real: the
 * app, the database, the turn token and the persisted conversation state.
 */
describe('Web chat (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let fetchSpy: jest.SpyInstance;
  const createdConversations = new Set<string>();

  const assistantReply = (overrides: Record<string, unknown> = {}) => ({
    turnId: 'ia-turn',
    reply: { text: 'El facial cuesta 150000 COP' },
    usage: { model: 'deepseek-flash', tokensIn: 12, tokensOut: 8 },
    ...overrides,
  });

  const mockAssistant = (body: unknown) =>
    fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => body } as never);

  const chat = (payload: unknown, cookie?: string) => {
    const call = request(app.getHttpServer()).post('/api/chat').send(payload as object);
    return cookie ? call.set('Cookie', cookie) : call;
  };

  const sessionCookieOf = (response: request.Response): string => {
    const cookies = (response.headers['set-cookie'] as unknown as string[]) || [];
    const session = cookies.find((value) => value.startsWith('kamerinos_chat_session='));
    return session ? session.split(';')[0] : '';
  };

  beforeAll(async () => {
    execSync('npx prisma migrate deploy', { stdio: 'pipe' });

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    // main.ts applies these two: without them the route is not reachable and
    // req.cookies is undefined.
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
    jwtService = app.get(JwtService);

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
  });

  it('answers an anonymous first turn, issues a turn token and persists the conversation', async () => {
    mockAssistant(assistantReply());

    const response = await chat({ message: { text: 'Cuánto cuesta un facial?' } });

    expect(response.status).toBe(200);
    expect(response.body.turnId).toMatch(UUID);
    expect(response.body.conversationId).toMatch(CONVERSATION_ID);
    expect(response.body.reply.text).toBe('El facial cuesta 150000 COP');
    expect(response.body.usage).toEqual({ model: 'deepseek-flash', tokensIn: 12, tokensOut: 8 });
    createdConversations.add(response.body.conversationId);

    const cookie = sessionCookieOf(response);
    expect(cookie).toContain('kamerinos_chat_session=');
    expect(cookie.split('=')[1]).toMatch(CONVERSATION_ID);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/v1/chat');
    expect(options.headers['X-Internal-Api-Key']).toBeDefined();

    const sentBody = JSON.parse(options.body);
    expect(sentBody).toEqual(
      expect.objectContaining({
        turnId: response.body.turnId,
        tenantId: 'kamerinos',
        conversationId: response.body.conversationId,
        channel: 'WEB_WIDGET',
        agent: 'CLIENTAS',
        identity: { kind: 'ANONYMOUS' },
        message: { text: 'Cuánto cuesta un facial?' },
        locale: 'es-CO',
        timezone: 'America/Bogota',
      }),
    );

    const turnToken = options.headers.Authorization.replace('Bearer ', '');
    const decoded = jwtService.decode(turnToken, { complete: true }) as any;
    expect(decoded.header.alg).toBe('ES256');
    expect(decoded.payload.jti).toBe(response.body.turnId);
    expect(decoded.payload.conversationId).toBe(response.body.conversationId);
    expect(decoded.payload.agent).toBe('CLIENTAS');

    const state = await prisma.chatConversationState.findUnique({
      where: { conversationId: response.body.conversationId },
    });
    expect(state).not.toBeNull();
    expect(state?.tenantId).toBe('kamerinos');
    expect(state?.identityKind).toBe('ANONYMOUS');
    expect(state?.channel).toBe('WEB_WIDGET');
    expect(state?.messageCount).toBe(1);
    expect(state?.handoffActive).toBe(false);
  });

  it('continues a conversation of the same session and increases the counter', async () => {
    mockAssistant(assistantReply());
    const first = await chat({ message: { text: 'Hola' } });
    createdConversations.add(first.body.conversationId);
    const cookie = sessionCookieOf(first);

    const second = await chat(
      { conversationId: first.body.conversationId, message: { text: 'Y un masaje?' } },
      cookie,
    );

    expect(second.status).toBe(200);
    expect(second.body.conversationId).toBe(first.body.conversationId);

    const state = await prisma.chatConversationState.findUnique({
      where: { conversationId: first.body.conversationId },
    });
    expect(state?.messageCount).toBe(2);
    expect(state?.lastTurnId).toBe(second.body.turnId);
  });

  it('keeps the conversation in handoff and stops calling the assistant', async () => {
    mockAssistant(
      assistantReply({ handoff: { requested: true, reason: 'EXPLICIT_REQUEST' } }),
    );
    const first = await chat({ message: { text: 'Quiero hablar con una persona' } });
    createdConversations.add(first.body.conversationId);
    const cookie = sessionCookieOf(first);

    expect(first.body.handoff).toEqual({ requested: true, reason: 'EXPLICIT_REQUEST' });
    const afterFirst = await prisma.chatConversationState.findUnique({
      where: { conversationId: first.body.conversationId },
    });
    expect(afterFirst?.handoffActive).toBe(true);
    expect(afterFirst?.handoffReason).toBe('EXPLICIT_REQUEST');

    fetchSpy.mockClear();
    const second = await chat(
      { conversationId: first.body.conversationId, message: { text: 'Sigues ahí?' } },
      cookie,
    );

    expect(second.status).toBe(200);
    expect(second.body.reply.text).toBe(HANDOFF_ACTIVE_MESSAGE);
    expect(second.body.handoff).toEqual({ requested: true, reason: 'EXPLICIT_REQUEST' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a conversation id from another session', async () => {
    mockAssistant(assistantReply());
    const first = await chat({ message: { text: 'Hola' } });
    createdConversations.add(first.body.conversationId);

    const response = await chat(
      { conversationId: first.body.conversationId, message: { text: 'Hola' } },
      `kamerinos_chat_session=${'b'.repeat(32)}`,
    );

    expect(response.status).toBe(403);
  });

  it('rejects a message longer than the limit with 413 without calling the assistant', async () => {
    mockAssistant(assistantReply());

    const response = await chat({ message: { text: 'x'.repeat(1001) } });

    expect(response.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an empty message with 400', async () => {
    const response = await chat({ message: { text: '' } });

    expect(response.status).toBe(400);
  });

  it('rejects a body without a message with 400', async () => {
    const response = await chat({});

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a message that is not an object with 400', async () => {
    const response = await chat({ message: 'Hola' });

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects unknown body properties with 400', async () => {
    const response = await chat({ message: { text: 'Hola' }, tenantId: 'otro', agent: 'ADMIN' });

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
