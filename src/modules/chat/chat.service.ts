import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { ACCESS_COOKIE } from '../../common/auth/cookies';
import { DEFAULT_TIMEZONE, toOffsetIso } from '../../common/time/timezone.util';
import { EmailService, HandoffNotificationData } from '../../common/email/email.service';
import {
  ChatChannel,
  ChatIdentityKind,
  IChatConversationState,
  IChatConversationStateRepository,
} from '../../repositories/interfaces/chat-conversation-state.repository';
import { AuthService } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';
import { TurnRole } from '../internal/interfaces/turn-token-payload';
import { TurnTokenService } from '../internal/turn-token.service';
import {
  ANONYMOUS_MESSAGE_CAP,
  ANONYMOUS_MESSAGE_WINDOW_MS,
  ANONYMOUS_SESSION_TTL_MS,
  CHAT_LOCALE,
  CHAT_SESSION_COOKIE,
  HANDOFF_ACTIVE_MESSAGE,
  MANUAL_REOPEN_REASON,
  MAX_MESSAGE_LENGTH,
} from './chat.constants';
import {
  deriveSessionKey,
  issueAnonymousSessionId,
  readIssuedSessionId,
  signAnonymousSessionId,
} from './chat-session';
import { IaBotClient } from './ia-bot.client';
import { WebChatRequestDto } from './dto/web-chat-request.dto';

export interface WebChatReply {
  conversationId: string;
  turnId: string;
  reply: { text: string; links?: { label: string; url: string }[] };
  handoff?: { requested: boolean; reason?: string | null };
  usage?: { model?: string; tokensIn: number; tokensOut: number };
}

/** Reversal of the handoff by a person of the salon (ADR 0013 point 6). */
export type ChatHandoffAction = 'close' | 'reopen';

/** Answer of the handoff admin endpoint: no session hash, no turn counters. */
export interface ChatHandoffView {
  conversationId: string;
  handoffActive: boolean;
  handoffReason: string | null;
  handoffMessage: string | null;
  handoffAt: Date | null;
  handoffClosedAt: Date | null;
  updatedAt: Date;
}

interface ResolvedIdentity {
  kind: ChatIdentityKind;
  channel: ChatChannel;
  sessionKey: string;
  /** True when the server had to issue a new anonymous session for this turn. */
  sessionIssued: boolean;
  userId?: string;
  role?: TurnRole;
}

const ANON_PREFIX = 'anon:';

/**
 * Web chat turn (Fase 1). Resolves tenant, channel and identity on the server,
 * issues the turn token, calls saaspa-IA and keeps the per-conversation state
 * (handoff, message counter) required by decision A-10a.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private configService: ConfigService,
    private tokenService: TokenService,
    private authService: AuthService,
    private turnTokenService: TurnTokenService,
    private iaBotClient: IaBotClient,
    private states: IChatConversationStateRepository,
    private email: EmailService,
  ) {}

  async handle(dto: WebChatRequestDto, request: Request, response: Response): Promise<WebChatReply> {
    if (dto.message.text.length > MAX_MESSAGE_LENGTH) {
      throw new PayloadTooLargeException(
        `El mensaje supera el límite de ${MAX_MESSAGE_LENGTH} caracteres`,
      );
    }

    const identity = await this.resolveIdentity(request);
    // The cookie only transports a session id this server issued: when it is
    // absent or does not verify, the server issues one and replaces the cookie.
    if (identity.kind === 'ANONYMOUS' && identity.sessionIssued) {
      this.setAnonymousSessionCookie(response, identity.sessionKey);
    }

    const tenantId = this.configService.get<string>('TENANT_ID') || '';
    const sessionKeyHash = this.hashSessionKey(identity.sessionKey);
    const conversationId = dto.conversationId || randomBytes(16).toString('hex');
    const turnId = randomUUID();
    const state = await this.states.findByConversationId(conversationId);

    this.assertConversationBelongsToSession(state, tenantId, sessionKeyHash);

    // A-10a: the conversation was handed off to a person, so the bot must not take
    // it back. The reply is answered here, without calling saaspa-IA.
    if (state?.handoffActive) {
      return {
        conversationId,
        turnId,
        reply: { text: HANDOFF_ACTIVE_MESSAGE },
        handoff: { requested: true, reason: state.handoffReason },
      };
    }

    const messagesInWindow = this.countMessagesInWindow(state);
    if (identity.kind === 'ANONYMOUS' && messagesInWindow >= ANONYMOUS_MESSAGE_CAP) {
      throw new HttpException(
        'Se alcanzó el límite de mensajes de esta sesión. Intenta de nuevo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const timezone = this.configService.get<string>('TENANT_TIMEZONE') || DEFAULT_TIMEZONE;
    const turnToken = this.turnTokenService.issue({
      turnId,
      conversationId,
      channel: identity.channel,
      agent: 'CLIENTAS',
      userId: identity.userId,
      role: identity.role,
    });

    const iaResponse = await this.iaBotClient.chat(
      {
        turnId,
        tenantId,
        conversationId,
        channel: identity.channel,
        agent: 'CLIENTAS',
        identity: { kind: identity.kind, userId: identity.userId, role: identity.role },
        message: { text: dto.message.text },
        locale: CHAT_LOCALE,
        timezone,
        now: toOffsetIso(new Date(), timezone),
      },
      turnToken,
    );

    const handoffRequested = iaResponse.handoff?.requested === true;
    const handoffReason = iaResponse.handoff?.reason ?? null;
    // One instant for both the row and the alert, so the salon can match them.
    const handoffAt = new Date();

    await this.persistTurn({
      state,
      conversationId,
      tenantId,
      identity,
      sessionKeyHash,
      turnId,
      messageCount: messagesInWindow + 1,
      handoffRequested,
      handoffReason,
      messageText: dto.message.text,
      handoffAt,
    });

    if (handoffRequested) {
      // J-05 / ADR 0013: a person has to know, and the reason alone is not enough
      // to take the conversation over.
      await this.notifyHandoff({
        conversationId,
        reason: handoffReason,
        message: dto.message.text,
        at: handoffAt,
        turnId,
        userId: identity.userId,
      });
    }

    // Without PII: only the turn, the channel and the conversation are logged.
    this.logger.log(
      `turno ${turnId} canal=${identity.channel} conversacion=${conversationId} handoff=${handoffRequested}`,
    );

    return {
      conversationId,
      turnId,
      reply: {
        text: iaResponse.reply?.text || '',
        ...(iaResponse.reply?.links?.length ? { links: iaResponse.reply.links } : {}),
      },
      ...(handoffRequested ? { handoff: { requested: true, reason: handoffReason } } : {}),
      usage: {
        model: iaResponse.usage?.model,
        tokensIn: iaResponse.usage?.tokensIn ?? 0,
        tokensOut: iaResponse.usage?.tokensOut ?? 0,
      },
    };
  }

  /**
   * Closes or reopens the handoff of a conversation (ADR 0013 point 2): a person
   * of the salon can undo the latch without touching the database by hand.
   *
   * `close` means the clienta is already attended: the handoff ends and the bot
   * answers again. `reopen` hands the conversation back to a person. Who did it
   * and when are recorded by the global AuditInterceptor.
   */
  async setHandoff(conversationId: string, action: ChatHandoffAction) {
    const state = await this.states.findByConversationId(conversationId);
    if (!state) {
      throw new NotFoundException('Conversación no encontrada');
    }

    const now = new Date();
    const updated =
      action === 'reopen'
        ? await this.states.setHandoff(conversationId, {
            handoffActive: true,
            handoffReason: MANUAL_REOPEN_REASON,
            handoffMessage: null,
            handoffAt: now,
            handoffClosedAt: null,
          })
        : await this.states.setHandoff(conversationId, {
            handoffActive: false,
            // Closing something that was already closed must not rewrite history.
            handoffClosedAt: state.handoffActive ? now : state.handoffClosedAt,
          });

    this.logger.log(
      `handoff ${action} conversacion=${conversationId} motivo=${updated.handoffReason ?? '-'}`,
    );

    return this.toHandoffView(updated);
  }

  /**
   * Identity always comes from the signed session cookie; anything invalid or
   * expired means anonymous (the contract says it is not an error).
   */
  private async resolveIdentity(request: Request): Promise<ResolvedIdentity> {
    const accessToken = request.cookies?.[ACCESS_COOKIE];
    if (accessToken) {
      try {
        const payload = this.tokenService.verifyToken(accessToken);
        const user = await this.authService.validateUser(payload.sub);
        if (user) {
          return {
            kind: 'USER',
            channel: 'WEB_LOGGED',
            sessionKey: `user:${user.id}`,
            sessionIssued: false,
            userId: user.id,
            role: user.role as TurnRole,
          };
        }
      } catch {
        // Expired, revoked or tampered cookie: continue as an anonymous visitor.
      }
    }

    // Only a value this server issued is accepted as a session; a client cannot
    // invent or edit one to get a fresh message counter (finding J-03).
    const issuedSessionId = readIssuedSessionId(
      request.cookies?.[CHAT_SESSION_COOKIE],
      this.sessionSigningKey,
    );
    const anonymousId = issuedSessionId ?? issueAnonymousSessionId();

    return {
      kind: 'ANONYMOUS',
      channel: 'WEB_WIDGET',
      sessionKey: `${ANON_PREFIX}${anonymousId}`,
      sessionIssued: issuedSessionId === null,
    };
  }

  /** Signs the session id before it travels in the cookie, and never in clear. */
  private setAnonymousSessionCookie(response: Response, sessionKey: string): void {
    response.cookie(
      CHAT_SESSION_COOKIE,
      signAnonymousSessionId(sessionKey.slice(ANON_PREFIX.length), this.sessionSigningKey),
      {
        httpOnly: true,
        secure: this.configService.get<string>('NODE_ENV') === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: ANONYMOUS_SESSION_TTL_MS,
      },
    );
  }

  /**
   * Signing key of the anonymous session, derived from the session secret so the
   * chat does not need another environment variable.
   */
  private get sessionSigningKey(): Buffer {
    return deriveSessionKey(this.configService.get<string>('JWT_SECRET') || '');
  }

  private assertConversationBelongsToSession(
    state: IChatConversationState | null,
    tenantId: string,
    sessionKeyHash: string,
  ): void {
    if (!state) return;
    if (state.tenantId !== tenantId) {
      throw new ForbiddenException('La conversación no pertenece a este tenant');
    }
    if (state.sessionKeyHash !== sessionKeyHash) {
      throw new ForbiddenException('La conversación no pertenece a esta sesión');
    }
  }

  private countMessagesInWindow(state: IChatConversationState | null): number {
    if (!state?.lastMessageAt) return 0;
    const withinWindow =
      Date.now() - new Date(state.lastMessageAt).getTime() < ANONYMOUS_MESSAGE_WINDOW_MS;
    return withinWindow ? state.messageCount : 0;
  }

  private hashSessionKey(sessionKey: string): string {
    return createHash('sha256').update(sessionKey).digest('hex');
  }

  private async persistTurn(input: {
    state: IChatConversationState | null;
    conversationId: string;
    tenantId: string;
    identity: ResolvedIdentity;
    sessionKeyHash: string;
    turnId: string;
    messageCount: number;
    handoffRequested: boolean;
    handoffReason: string | null;
    messageText: string;
    handoffAt: Date;
  }): Promise<void> {
    const handoff = input.handoffRequested
      ? {
          handoffActive: true,
          handoffReason: input.handoffReason,
          // The trigger is kept so a person can recover the conversation (J-05).
          handoffMessage: input.messageText,
          handoffAt: input.handoffAt,
        }
      : {};

    if (input.state) {
      await this.states.update(input.state.id, {
        lastTurnId: input.turnId,
        messageCount: input.messageCount,
        lastMessageAt: new Date(),
        ...handoff,
      });
      return;
    }

    await this.states.create({
      conversationId: input.conversationId,
      tenantId: input.tenantId,
      channel: input.identity.channel,
      identityKind: input.identity.kind,
      userId: input.identity.userId ?? null,
      sessionKeyHash: input.sessionKeyHash,
      lastTurnId: input.turnId,
      messageCount: input.messageCount,
      lastMessageAt: new Date(),
      ...handoff,
    });
  }

  /**
   * Alerts the salon by email (J-05 / ADR 0013). A failing mail must never break
   * the turn: the clienta already has her answer.
   */
  private async notifyHandoff(data: HandoffNotificationData): Promise<void> {
    try {
      await this.email.sendHandoffNotification(data);
    } catch (error) {
      this.logger.warn(
        `No se pudo avisar al salón del handoff de ${data.conversationId}: ${(error as Error)?.message}`,
      );
    }
  }

  private toHandoffView(state: IChatConversationState): ChatHandoffView {
    return {
      conversationId: state.conversationId,
      handoffActive: state.handoffActive,
      handoffReason: state.handoffReason,
      handoffMessage: state.handoffMessage,
      handoffAt: state.handoffAt,
      handoffClosedAt: state.handoffClosedAt,
      updatedAt: state.updatedAt,
    };
  }
}
