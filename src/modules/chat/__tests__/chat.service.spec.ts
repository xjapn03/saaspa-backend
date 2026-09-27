import { BadGatewayException, HttpException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
import {
  IChatConversationState,
  IChatConversationStateRepository,
} from '../../../repositories/interfaces/chat-conversation-state.repository';
import { AuthService } from '../../auth/auth.service';
import { TokenService } from '../../auth/token.service';
import { TurnTokenService } from '../../internal/turn-token.service';
import { ChatService } from '../chat.service';
import { IaBotClient } from '../ia-bot.client';
import {
  ANONYMOUS_MESSAGE_CAP,
  ANONYMOUS_MESSAGE_WINDOW_MS,
  HANDOFF_ACTIVE_MESSAGE,
} from '../chat.constants';
import { deriveSessionKey, signAnonymousSessionId } from '../chat-session';

const hashOf = (value: string) => createHash('sha256').update(value).digest('hex');

const JWT_SECRET = 'test-secret';
const signingKey = deriveSessionKey(JWT_SECRET);
/** Cookie value the server issues for this session id (id + signature). */
const issuedCookie = (sessionId: string) => signAnonymousSessionId(sessionId, signingKey);

describe('ChatService', () => {
  let service: ChatService;
  let tokenService: DeepMockProxy<TokenService>;
  let authService: DeepMockProxy<AuthService>;
  let turnTokens: DeepMockProxy<TurnTokenService>;
  let iaBot: DeepMockProxy<IaBotClient>;
  let states: DeepMockProxy<IChatConversationStateRepository>;

  const ANON_ID = 'a'.repeat(32);
  const iaReply = {
    turnId: 'ia-turn',
    reply: { text: 'Claro, el facial cuesta 150000 COP' },
    usage: { model: 'deepseek-flash', tokensIn: 12, tokensOut: 8 },
  };

  const stateFor = (overrides: Partial<IChatConversationState> = {}): IChatConversationState => ({
    id: 'state-1',
    tenantId: 'kamerinos',
    conversationId: ANON_ID,
    channel: 'WEB_WIDGET',
    identityKind: 'ANONYMOUS',
    userId: null,
    sessionKeyHash: hashOf(`anon:${ANON_ID}`),
    handoffActive: false,
    handoffReason: null,
    lastTurnId: 'previous-turn',
    messageCount: 1,
    lastMessageAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const request = (cookies: Record<string, string> = {}) => ({ cookies } as unknown as Request);
  const response = () => ({ cookie: jest.fn() }) as unknown as Response & { cookie: jest.Mock };

  beforeEach(async () => {
    tokenService = mockDeep<TokenService>();
    authService = mockDeep<AuthService>();
    turnTokens = mockDeep<TurnTokenService>();
    iaBot = mockDeep<IaBotClient>();
    states = mockDeep<IChatConversationStateRepository>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            TENANT_ID: 'kamerinos',
            TENANT_TIMEZONE: 'America/Bogota',
            NODE_ENV: 'test',
            JWT_SECRET,
          }),
        },
        { provide: TokenService, useValue: tokenService },
        { provide: AuthService, useValue: authService },
        { provide: TurnTokenService, useValue: turnTokens },
        { provide: IaBotClient, useValue: iaBot },
        { provide: IChatConversationStateRepository, useValue: states },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);

    turnTokens.issue.mockReturnValue('issued-turn-token');
    iaBot.chat.mockResolvedValue(iaReply as never);
    states.findByConversationId.mockResolvedValue(null);
    states.create.mockImplementation(async (data) => stateFor(data as never));
    states.update.mockResolvedValue(stateFor());
  });

  describe('identity resolution', () => {
    it('treats a visitor without a session cookie as anonymous and sets the anon session cookie', async () => {
      const res = response();

      const reply = await service.handle({ message: { text: 'Hola' } }, request(), res);

      expect(reply.conversationId).toMatch(/^[0-9a-f]{32}$/);
      expect(res.cookie).toHaveBeenCalledTimes(1);
      expect(res.cookie.mock.calls[0][0]).toBe('kamerinos_chat_session');
      expect(iaBot.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'WEB_WIDGET',
          agent: 'CLIENTAS',
          tenantId: 'kamerinos',
          identity: { kind: 'ANONYMOUS', userId: undefined, role: undefined },
        }),
        'issued-turn-token',
      );
      expect(turnTokens.issue).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'WEB_WIDGET', agent: 'CLIENTAS', userId: undefined }),
      );
      // The first turn must store lastMessageAt, otherwise the message window
      // restarts and the anonymous counter never accumulates.
      expect(states.create).toHaveBeenCalledWith(
        expect.objectContaining({ messageCount: 1, lastMessageAt: expect.any(Date) }),
      );
    });

    it('resolves the identity of a signed in client from the session cookie', async () => {
      tokenService.verifyToken.mockReturnValue({ sub: 'user-1', email: 'a@b.co', role: 'CLIENTE' });
      authService.validateUser.mockResolvedValue({ id: 'user-1', role: 'CLIENTE' } as never);
      const res = response();

      await service.handle(
        { message: { text: 'Hola' } },
        request({ kamerinos_access_token: 'session' }),
        res,
      );

      expect(res.cookie).not.toHaveBeenCalled();
      expect(iaBot.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'WEB_LOGGED',
          identity: { kind: 'USER', userId: 'user-1', role: 'CLIENTE' },
        }),
        'issued-turn-token',
      );
    });

    it('falls back to anonymous when the session cookie is expired or invalid', async () => {
      tokenService.verifyToken.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      const res = response();

      await service.handle(
        { message: { text: 'Hola' } },
        request({ kamerinos_access_token: 'expired' }),
        res,
      );

      expect(iaBot.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'WEB_WIDGET',
          identity: expect.objectContaining({ kind: 'ANONYMOUS' }),
        }),
        'issued-turn-token',
      );
      expect(res.cookie).toHaveBeenCalledTimes(1);
    });

    it('accepts the session id the server issued on a previous turn', async () => {
      states.findByConversationId.mockResolvedValue(stateFor());
      const res = response();

      await service.handle(
        { conversationId: ANON_ID, message: { text: 'Hola de nuevo' } },
        request({ kamerinos_chat_session: issuedCookie(ANON_ID) }),
        res,
      );

      // Trusted as is: the conversation is found (no 403) and the cookie is not reissued.
      expect(res.cookie).not.toHaveBeenCalled();
      expect(states.findByConversationId).toHaveBeenCalledWith(ANON_ID);
      expect(states.update).toHaveBeenCalledWith(
        'state-1',
        expect.objectContaining({ messageCount: 2 }),
      );
      expect(states.create).not.toHaveBeenCalled();
    });

    it.each(['b'.repeat(32), 'client-chosen-session-value'])(
      'rejects the session id the client fabricated (%s) and issues a new one',
      async (fabricated) => {
        const res = response();

        await service.handle(
          { message: { text: 'Hola' } },
          request({ kamerinos_chat_session: fabricated }),
          res,
        );

        expect(res.cookie).toHaveBeenCalledTimes(1);
        const [, issued] = res.cookie.mock.calls[0] as [string, string];
        expect(issued).not.toBe(fabricated);
        // The turn belongs to the session the server issued, never to the invented value.
        expect(states.create).toHaveBeenCalledWith(
          expect.objectContaining({ sessionKeyHash: hashOf(`anon:${issued.split('.')[0]}`) }),
        );
        expect(states.create).not.toHaveBeenCalledWith(
          expect.objectContaining({ sessionKeyHash: hashOf(`anon:${fabricated}`) }),
        );
      },
    );

    it('rejects a server issued session id whose signature was tampered with', async () => {
      const res = response();

      await service.handle(
        { message: { text: 'Hola' } },
        request({ kamerinos_chat_session: `${ANON_ID}.${'0'.repeat(64)}` }),
        res,
      );

      expect(res.cookie).toHaveBeenCalledTimes(1);
      const [, issued] = res.cookie.mock.calls[0] as [string, string];
      expect(issued.split('.')[0]).not.toBe(ANON_ID);
      expect(states.create).toHaveBeenCalledWith(
        expect.objectContaining({ sessionKeyHash: hashOf(`anon:${issued.split('.')[0]}`) }),
      );
    });
  });

  describe('conversation binding', () => {
    it('keeps the conversation id when it belongs to the same session', async () => {
      states.findByConversationId.mockResolvedValue(stateFor());

      const reply = await service.handle(
        { conversationId: ANON_ID, message: { text: 'Hola de nuevo' } },
        request({ kamerinos_chat_session: issuedCookie(ANON_ID) }),
        response(),
      );

      expect(reply.conversationId).toBe(ANON_ID);
      expect(states.update).toHaveBeenCalledTimes(1);
    });

    it('rejects a conversation id that belongs to another session', async () => {
      states.findByConversationId.mockResolvedValue(stateFor());

      await expect(
        service.handle(
          { conversationId: ANON_ID, message: { text: 'Hola' } },
          request({ kamerinos_chat_session: issuedCookie('b'.repeat(32)) }),
          response(),
        ),
      ).rejects.toThrow('La conversación no pertenece a esta sesión');

      expect(iaBot.chat).not.toHaveBeenCalled();
      expect(states.update).not.toHaveBeenCalled();
    });

    it('rejects a conversation id from another tenant', async () => {
      states.findByConversationId.mockResolvedValue(stateFor({ tenantId: 'otro' }));

      await expect(
        service.handle(
          { conversationId: ANON_ID, message: { text: 'Hola' } },
          request({ kamerinos_chat_session: issuedCookie(ANON_ID) }),
          response(),
        ),
      ).rejects.toThrow('La conversación no pertenece a este tenant');

      expect(iaBot.chat).not.toHaveBeenCalled();
    });
  });

  describe('handoff state (A-10a)', () => {
    it('answers the canonical handoff message without calling the assistant', async () => {
      states.findByConversationId.mockResolvedValue(
        stateFor({ handoffActive: true, handoffReason: 'HEALTH_TOPIC' }),
      );

      const reply = await service.handle(
        { conversationId: ANON_ID, message: { text: 'Tengo una alergia' } },
        request({ kamerinos_chat_session: issuedCookie(ANON_ID) }),
        response(),
      );

      expect(iaBot.chat).not.toHaveBeenCalled();
      expect(turnTokens.issue).not.toHaveBeenCalled();
      expect(reply.reply.text).toBe(HANDOFF_ACTIVE_MESSAGE);
      expect(reply.handoff).toEqual({ requested: true, reason: 'HEALTH_TOPIC' });
      expect(reply.usage).toBeUndefined();
      expect(states.update).not.toHaveBeenCalled();
    });

    it('persists the handoff requested by the assistant', async () => {
      iaBot.chat.mockResolvedValue({
        ...iaReply,
        handoff: { requested: true, reason: 'EXPLICIT_REQUEST' },
      } as never);

      const reply = await service.handle(
        { message: { text: 'Quiero hablar con una persona' } },
        request(),
        response(),
      );

      expect(states.create).toHaveBeenCalledWith(
        expect.objectContaining({ handoffActive: true, handoffReason: 'EXPLICIT_REQUEST' }),
      );
      expect(reply.handoff).toEqual({ requested: true, reason: 'EXPLICIT_REQUEST' });
    });

    it('does not touch the handoff columns on a normal turn', async () => {
      states.findByConversationId.mockResolvedValue(stateFor());

      const reply = await service.handle(
        { conversationId: ANON_ID, message: { text: 'Cuánto cuesta el facial?' } },
        request({ kamerinos_chat_session: issuedCookie(ANON_ID) }),
        response(),
      );

      expect(states.update).toHaveBeenCalledWith(
        'state-1',
        expect.objectContaining({ lastTurnId: expect.any(String), messageCount: 2 }),
      );
      expect(reply.handoff).toBeUndefined();
    });
  });

  describe('anti abuse', () => {
    it('rejects a message longer than the limit with 413 without calling the assistant', async () => {
      await expect(
        service.handle({ message: { text: 'x'.repeat(1001) } }, request(), response()),
      ).rejects.toThrow(PayloadTooLargeException);

      expect(iaBot.chat).not.toHaveBeenCalled();
      expect(states.findByConversationId).not.toHaveBeenCalled();
    });

    it('accepts a message of exactly the limit', async () => {
      await service.handle({ message: { text: 'x'.repeat(1000) } }, request(), response());

      expect(iaBot.chat).toHaveBeenCalledTimes(1);
    });

    it('returns 429 for an anonymous session that reached the message cap', async () => {
      states.findByConversationId.mockResolvedValue(stateFor({ messageCount: ANONYMOUS_MESSAGE_CAP }));

      await expect(
        service.handle(
          { conversationId: ANON_ID, message: { text: 'Hola' } },
          request({ kamerinos_chat_session: issuedCookie(ANON_ID) }),
          response(),
        ),
      ).rejects.toMatchObject({ status: 429 });

      expect(iaBot.chat).not.toHaveBeenCalled();
    });

    it('does not apply the message cap to signed in clients', async () => {
      tokenService.verifyToken.mockReturnValue({ sub: 'user-1', email: 'a@b.co', role: 'CLIENTE' });
      authService.validateUser.mockResolvedValue({ id: 'user-1', role: 'CLIENTE' } as never);
      states.findByConversationId.mockResolvedValue(
        stateFor({
          identityKind: 'USER',
          userId: 'user-1',
          sessionKeyHash: hashOf('user:user-1'),
          messageCount: 500,
        }),
      );

      await service.handle(
        { conversationId: ANON_ID, message: { text: 'Hola' } },
        request({ kamerinos_access_token: 'session' }),
        response(),
      );

      expect(iaBot.chat).toHaveBeenCalledTimes(1);
    });

    it('restarts the counter when the previous message is outside the window', async () => {
      states.findByConversationId.mockResolvedValue(
        stateFor({
          messageCount: ANONYMOUS_MESSAGE_CAP,
          lastMessageAt: new Date(Date.now() - ANONYMOUS_MESSAGE_WINDOW_MS - 1000),
        }),
      );

      await service.handle(
        { conversationId: ANON_ID, message: { text: 'Hola' } },
        request({ kamerinos_chat_session: issuedCookie(ANON_ID) }),
        response(),
      );

      expect(iaBot.chat).toHaveBeenCalledTimes(1);
      expect(states.update).toHaveBeenCalledWith(
        'state-1',
        expect.objectContaining({ messageCount: 1 }),
      );
    });
  });

  describe('response mapping', () => {
    it('coerces null token usage to zero and omits missing links', async () => {
      iaBot.chat.mockResolvedValue({
        turnId: 'ia-turn',
        reply: { text: 'ok' },
        usage: { model: 'deepseek-flash', tokensIn: null, tokensOut: null },
      } as never);

      const reply = await service.handle({ message: { text: 'Hola' } }, request(), response());

      expect(reply.usage).toEqual({ model: 'deepseek-flash', tokensIn: 0, tokensOut: 0 });
      expect(reply.reply.links).toBeUndefined();
    });

    it('returns the links provided by the assistant', async () => {
      iaBot.chat.mockResolvedValue({
        ...iaReply,
        reply: { text: 'Puedes agendar aquí', links: [{ label: 'Agendar', url: 'https://x.test/agendar' }] },
      } as never);

      const reply = await service.handle({ message: { text: 'Quiero agendar' } }, request(), response());

      expect(reply.reply.links).toEqual([{ label: 'Agendar', url: 'https://x.test/agendar' }]);
    });

    it('does not persist the turn when the assistant fails', async () => {
      iaBot.chat.mockRejectedValue(new BadGatewayException('down'));

      await expect(
        service.handle({ message: { text: 'Hola' } }, request(), response()),
      ).rejects.toThrow(BadGatewayException);

      expect(states.create).not.toHaveBeenCalled();
      expect(states.update).not.toHaveBeenCalled();
    });
  });
});
