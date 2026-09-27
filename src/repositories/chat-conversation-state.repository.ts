import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  CreateChatConversationStateInput,
  HandoffNotificationOutcome,
  IChatConversationState,
  IChatConversationStateRepository,
  SetChatHandoffInput,
  UpdateChatConversationStateInput,
} from './interfaces/chat-conversation-state.repository';

@Injectable()
export class ChatConversationStateRepository extends IChatConversationStateRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async findByConversationId(conversationId: string): Promise<IChatConversationState | null> {
    const state = await this.prisma.chatConversationState.findUnique({ where: { conversationId } });
    if (!state) return null;
    return state as unknown as IChatConversationState;
  }

  async create(data: CreateChatConversationStateInput): Promise<IChatConversationState> {
    try {
      const state = await this.prisma.chatConversationState.create({ data });
      return state as unknown as IChatConversationState;
    } catch (error) {
      // Two first turns of the same conversation can race on the unique index:
      // return the row created by the other request instead of failing.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.findByConversationId(data.conversationId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async update(id: string, data: UpdateChatConversationStateInput): Promise<IChatConversationState> {
    const state = await this.prisma.chatConversationState.update({
      where: { id },
      data: {
        lastTurnId: data.lastTurnId,
        messageCount: data.messageCount,
        lastMessageAt: data.lastMessageAt,
        ...(data.handoffActive === undefined ? {} : { handoffActive: data.handoffActive }),
        ...(data.handoffReason === undefined ? {} : { handoffReason: data.handoffReason }),
        ...(data.handoffMessage === undefined ? {} : { handoffMessage: data.handoffMessage }),
        ...(data.handoffAt === undefined ? {} : { handoffAt: data.handoffAt }),
      },
    });
    return state as unknown as IChatConversationState;
  }

  /**
   * Closes or reopens the handoff of a conversation (ADR 0013 point 2). It does
   * not touch the turn counters: a person acting on the conversation is not a
   * turn of the bot.
   */
  async setHandoff(
    conversationId: string,
    data: SetChatHandoffInput,
  ): Promise<IChatConversationState> {
    const state = await this.prisma.chatConversationState.update({
      where: { conversationId },
      data: {
        handoffActive: data.handoffActive,
        ...(data.handoffReason === undefined ? {} : { handoffReason: data.handoffReason }),
        ...(data.handoffMessage === undefined ? {} : { handoffMessage: data.handoffMessage }),
        ...(data.handoffAt === undefined ? {} : { handoffAt: data.handoffAt }),
        ...(data.handoffClosedAt === undefined ? {} : { handoffClosedAt: data.handoffClosedAt }),
      },
    });
    return state as unknown as IChatConversationState;
  }

  /**
   * Records one attempt at alerting the salon of a handoff (H-03): the counter
   * always moves, `handoffNotifiedAt` is set only on delivery and the error is
   * kept (short) when it failed, so the next turn can tell it has to retry.
   */
  async recordHandoffNotification(
    conversationId: string,
    outcome: HandoffNotificationOutcome,
  ): Promise<IChatConversationState> {
    const state = await this.prisma.chatConversationState.update({
      where: { conversationId },
      data: {
        handoffNotifyAttempts: { increment: 1 },
        ...(outcome.delivered
          ? { handoffNotifiedAt: new Date(), handoffNotifyError: null }
          : { handoffNotifyError: (outcome.error || 'NOT_DELIVERED').slice(0, 300) }),
      },
    });
    return state as unknown as IChatConversationState;
  }
}
