import { execSync } from 'child_process';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ACCESS_COOKIE } from '../../src/common/auth/cookies';
import { EmailService } from '../../src/common/email/email.service';
import { PrismaService } from '../../src/database/prisma.service';
import { HANDOFF_ACTIVE_MESSAGE } from '../../src/modules/chat/chat.constants';

/**
 * J-05 / ADR 0013 end to end: the handoff of a chat conversation alerts the salon
 * by email, the message that triggered it is recoverable, a person can close it
 * through the admin endpoint (with an audit trail) and the bot answers again.
 * saaspa-IA is not running, so `fetch` is replaced by a fake assistant.
 */
describe('Chat handoff (e2e)', () => {
  const CONVERSATION_ID = new RegExp('^[0-9a-f]{32}$');
  const ADMIN_EMAIL = 'admin@sandrapinzonsaludybelleza.com.co';

  let app: INestApplication;
  let prisma: PrismaService;
  let email: EmailService;
  let fetchSpy: jest.SpyInstance;
  let adminCookie = '';
  const createdConversations = new Set<string>();

  const cookieValue = (response: request.Response, name: string): string => {
    const cookies = (response.headers['set-cookie'] as unknown as string[]) || [];
    const cookie = cookies.find((value) => value.startsWith(`${name}=`));
    return cookie ? cookie.split(';')[0].slice(name.length + 1) : '';
  };

  const sessionCookieOf = (response: request.Response): string => {
    const cookies = (response.headers['set-cookie'] as unknown as string[]) || [];
    const session = cookies.find((value) => value.startsWith('kamerinos_chat_session='));
    return session ? session.split(';')[0] : '';
  };

  const assistantReply = (overrides: Record<string, unknown> = {}) => ({
    turnId: 'ia-turn',
    reply: { text: 'Claro, ¿en qué te ayudo?' },
    usage: { model: 'deepseek-flash', tokensIn: 10, tokensOut: 5 },
    ...overrides,
  });

  const mockAssistant = (body: unknown) =>
    fetchSpy.mockResolvedValue({ ok: true, status: 200, json: async () => body } as never);

  const chat = (payload: unknown, cookie?: string) => {
    const call = request(app.getHttpServer())
      .post('/api/chat')
      .send(payload as object);
    return cookie ? call.set('Cookie', cookie) : call;
  };

  const handoff = (conversationId: string, action: string, cookie = adminCookie) =>
    request(app.getHttpServer())
      .patch(`/api/chat/conversations/${conversationId}/handoff`)
      .set('Cookie', cookie)
      .send({ action });

  const stateOf = (conversationId: string) =>
    prisma.chatConversationState.findUnique({ where: { conversationId } });

  /**
   * Waits for an AuditLog row. The AuditInterceptor records fire-and-forget (a
   * slow insert must not delay the response), so the assertion polls instead of
   * racing the write, which is what made this spec flaky under the full suite.
   */
  const waitForAudit = async (where: { entity: string; entityId: string; action: string }) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const row = await prisma.auditLog.findFirst({ where });
      if (row) return row;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  };

  /** Starts a conversation that ends in handoff and returns its ids. */
  const startHandoff = async (text: string) => {
    mockAssistant(assistantReply({ handoff: { requested: true, reason: 'EXPLICIT_REQUEST' } }));
    const response = await chat({ message: { text } });
    createdConversations.add(response.body.conversationId);
    return { response, cookie: sessionCookieOf(response) };
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
    email = app.get(EmailService);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'admin123' });
    adminCookie = `${ACCESS_COOKIE}=${cookieValue(login, ACCESS_COOKIE)}`;

    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterAll(async () => {
    const ids = [...createdConversations];
    if (ids.length > 0) {
      await prisma.chatConversationState.deleteMany({ where: { conversationId: { in: ids } } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    }
    fetchSpy.mockRestore();
    await app.close();
  });

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('notifies the salon, keeps the trigger and lets a person close the handoff so the bot answers again', async () => {
    const notify = jest.spyOn(email, 'sendHandoffNotification').mockResolvedValue(true);

    const { response, cookie } = await startHandoff('Quiero hablar con una persona');
    const conversationId = response.body.conversationId;

    expect(response.status).toBe(200);
    expect(conversationId).toMatch(CONVERSATION_ID);

    // 1. The salon is alerted with what a person needs to take over.
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId,
        reason: 'EXPLICIT_REQUEST',
        message: 'Quiero hablar con una persona',
        turnId: response.body.turnId,
      }),
    );

    // 2. The trigger is recoverable, not just the boolean.
    const state = await stateOf(conversationId);
    expect(state?.handoffActive).toBe(true);
    expect(state?.handoffReason).toBe('EXPLICIT_REQUEST');
    expect(state?.handoffMessage).toBe('Quiero hablar con una persona');
    expect(state?.handoffAt).toBeInstanceOf(Date);

    // 3. While the handoff is active the bot does not answer...
    fetchSpy.mockClear();
    const latched = await chat({ conversationId, message: { text: '¿Hola?' } }, cookie);
    expect(latched.body.reply.text).toBe(HANDOFF_ACTIVE_MESSAGE);
    expect(fetchSpy).not.toHaveBeenCalled();

    // 4. ...until a person closes it; the AuditLog keeps who did it and when.
    const closed = await handoff(conversationId, 'close');
    expect(closed.status).toBe(200);
    expect(closed.body).toEqual(
      expect.objectContaining({
        conversationId,
        handoffActive: false,
        handoffClosedAt: expect.any(String),
      }),
    );
    expect(closed.body).not.toHaveProperty('sessionKeyHash');

    const audit = await waitForAudit({
      entity: 'chat',
      entityId: conversationId,
      action: 'PATCH',
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorEmail).toBe(ADMIN_EMAIL);

    // 5. The bot answers that conversation again.
    mockAssistant(assistantReply({ reply: { text: 'Gracias por avisar, seguimos por aquí' } }));
    fetchSpy.mockClear();
    const resumed = await chat({ conversationId, message: { text: 'Ya me atendieron' } }, cookie);
    expect(resumed.body.reply.text).toBe('Gracias por avisar, seguimos por aquí');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    notify.mockRestore();
  });

  it('reopens the handoff, so the bot hands the conversation back to a person', async () => {
    const notify = jest.spyOn(email, 'sendHandoffNotification').mockResolvedValue(true);

    const { response, cookie } = await startHandoff('Necesito hablar con alguien');
    const conversationId = response.body.conversationId;
    await handoff(conversationId, 'close');
    notify.mockClear();

    const reopened = await handoff(conversationId, 'reopen');
    expect(reopened.status).toBe(200);
    expect(reopened.body).toEqual(
      expect.objectContaining({
        handoffActive: true,
        handoffReason: 'MANUAL_REOPEN',
        handoffClosedAt: null,
      }),
    );

    fetchSpy.mockClear();
    const latched = await chat({ conversationId, message: { text: '¿Sigue ahí?' } }, cookie);
    expect(latched.body.reply.text).toBe(HANDOFF_ACTIVE_MESSAGE);
    expect(fetchSpy).not.toHaveBeenCalled();
    // A person reopened it on purpose: the salon is not alerted again.
    expect(notify).not.toHaveBeenCalled();

    notify.mockRestore();
  });

  it('retries the alert on the next turn when the first delivery failed (H-03)', async () => {
    const notify = jest
      .spyOn(email, 'sendHandoffNotification')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const { response, cookie } = await startHandoff('Necesito hablar con una persona ya');
    const conversationId = response.body.conversationId;

    // 1. The first attempt failed: the alert stays pending and the failure is kept.
    expect(notify).toHaveBeenCalledTimes(1);
    let state = await stateOf(conversationId);
    expect(state?.handoffNotifiedAt).toBeNull();
    expect(state?.handoffNotifyAttempts).toBe(1);
    expect(state?.handoffNotifyError).toBe('NOT_DELIVERED');

    // 2. The next turn retries it, without calling the assistant.
    fetchSpy.mockClear();
    const latched = await chat({ conversationId, message: { text: '¿Hola?' } }, cookie);
    expect(latched.body.reply.text).toBe(HANDOFF_ACTIVE_MESSAGE);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(2);
    state = await stateOf(conversationId);
    expect(state?.handoffNotifiedAt).toBeInstanceOf(Date);
    expect(state?.handoffNotifyAttempts).toBe(2);
    expect(state?.handoffNotifyError).toBeNull();

    // 3. Once delivered, later turns do not retry.
    await chat({ conversationId, message: { text: '¿Sigue ahí?' } }, cookie);
    expect(notify).toHaveBeenCalledTimes(2);

    notify.mockRestore();
  });

  it('rejects an unknown conversation with 404 and needs a session', async () => {
    const unknown = await handoff('f'.repeat(32), 'close');
    expect(unknown.status).toBe(404);

    const anonymous = await handoff('f'.repeat(32), 'close', '');
    expect(anonymous.status).toBe(401);

    const invalidAction = await handoff('f'.repeat(32), 'abrir');
    expect(invalidAction.status).toBe(400);
  });
});
