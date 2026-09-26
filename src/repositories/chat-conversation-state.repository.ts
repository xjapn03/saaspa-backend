import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  CreateChatConversationStateInput,
  IChatConversationState,
  IChatConversationStateRepository,
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
      },
    });
    return state as unknown as IChatConversationState;
  }
}
