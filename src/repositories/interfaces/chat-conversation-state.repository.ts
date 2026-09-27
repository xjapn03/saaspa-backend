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
  handoffMessage: string | null;
  handoffAt: Date | null;
  handoffClosedAt: Date | null;
  /** Set only when the salon alert was accepted for delivery (H-03). */
  handoffNotifiedAt: Date | null;
  /** Short reason kept when the alert could not be delivered. */
  handoffNotifyError: string | null;
  /** How many times the alert was attempted. */
  handoffNotifyAttempts: number;
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
  handoffMessage?: string | null;
  handoffAt?: Date | null;
}

export interface UpdateChatConversationStateInput {
  lastTurnId: string;
  messageCount: number;
  lastMessageAt: Date;
  handoffActive?: boolean;
  handoffReason?: string | null;
  handoffMessage?: string | null;
  handoffAt?: Date | null;
}

/** Reversal of the handoff by a person of the salon (ADR 0013 point 2). */
export interface SetChatHandoffInput {
  handoffActive: boolean;
  handoffReason?: string | null;
  handoffMessage?: string | null;
  handoffAt?: Date | null;
  handoffClosedAt?: Date | null;
}

/**
 * Result of a handoff alert delivery attempt (H-03). `delivered: true` means the
 * mail was accepted by the provider; otherwise the alert stays pending and the
 * next turn of the conversation retries it.
 */
export type HandoffNotificationOutcome =
  | { delivered: true }
  | { delivered: false; error: string | null };

export abstract class IChatConversationStateRepository {
  abstract findByConversationId(conversationId: string): Promise<IChatConversationState | null>;
  abstract create(data: CreateChatConversationStateInput): Promise<IChatConversationState>;
  abstract update(id: string, data: UpdateChatConversationStateInput): Promise<IChatConversationState>;
  /** Closes or reopens the handoff without touching the turn counters. */
  abstract setHandoff(
    conversationId: string,
    data: SetChatHandoffInput,
  ): Promise<IChatConversationState>;
  /** Records the outcome of the salon alert: attempts + delivered/failed (H-03). */
  abstract recordHandoffNotification(
    conversationId: string,
    outcome: HandoffNotificationOutcome,
  ): Promise<IChatConversationState>;
}
