export type ChatChannel = 'WEB_WIDGET' | 'WEB_LOGGED' | 'DASHBOARD' | 'WHATSAPP';

export type ChatIdentityKind = 'ANONYMOUS' | 'USER';

export interface IChatConversationState {
  id: string;
  tenantId: string;
  conversationId: string;
  channel: string;
  identityKind: string;
  userId: string | null;
  sessionKeyHash: string;
  handoffActive: boolean;
  handoffReason: string | null;
  lastTurnId: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateChatConversationStateInput {
  conversationId: string;
  tenantId: string;
  channel: ChatChannel;
  identityKind: ChatIdentityKind;
  userId?: string | null;
  sessionKeyHash: string;
  lastTurnId: string;
  messageCount?: number;
  lastMessageAt?: Date;
  handoffActive?: boolean;
  handoffReason?: string | null;
}

export interface UpdateChatConversationStateInput {
  lastTurnId: string;
  messageCount: number;
  lastMessageAt: Date;
  handoffActive?: boolean;
  handoffReason?: string | null;
}

export abstract class IChatConversationStateRepository {
  abstract findByConversationId(conversationId: string): Promise<IChatConversationState | null>;
  abstract create(data: CreateChatConversationStateInput): Promise<IChatConversationState>;
  abstract update(id: string, data: UpdateChatConversationStateInput): Promise<IChatConversationState>;
}
