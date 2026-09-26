import { Prisma } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from '../../database/prisma.service';
import { ChatConversationStateRepository } from '../chat-conversation-state.repository';
import { CreateChatConversationStateInput } from '../interfaces/chat-conversation-state.repository';

describe('ChatConversationStateRepository', () => {
  let repository: ChatConversationStateRepository;
  let prisma: DeepMockProxy<PrismaService>;

  const row = {
    id: 'state-1',
    tenantId: 'kamerinos',
    conversationId: 'c1',
    channel: 'WEB_WIDGET',
    identityKind: 'ANONYMOUS',
    userId: null,
    sessionKeyHash: 'hash',
    handoffActive: false,
    handoffReason: null,
    lastTurnId: 'turn-1',
    messageCount: 1,
    lastMessageAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createInput: CreateChatConversationStateInput = {
    conversationId: 'c1',
    tenantId: 'kamerinos',
    channel: 'WEB_WIDGET',
    identityKind: 'ANONYMOUS',
    sessionKeyHash: 'hash',
    lastTurnId: 'turn-1',
    messageCount: 1,
  };

  const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: '5.22.0' });

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    repository = new ChatConversationStateRepository(prisma);
  });

  it('returns null when the conversation has no state yet', async () => {
    prisma.chatConversationState.findUnique.mockResolvedValue(null);

    expect(await repository.findByConversationId('c1')).toBeNull();
    expect(prisma.chatConversationState.findUnique).toHaveBeenCalledWith({ where: { conversationId: 'c1' } });
  });

  it('creates the state of the first turn', async () => {
    prisma.chatConversationState.create.mockResolvedValue(row as never);

    const created = await repository.create(createInput);

    expect(created.id).toBe('state-1');
    expect(prisma.chatConversationState.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ conversationId: 'c1', messageCount: 1, tenantId: 'kamerinos' }),
    });
  });

  it('returns the existing row when a concurrent first turn hits the unique index', async () => {
    prisma.chatConversationState.create.mockRejectedValue(prismaError('P2002'));
    prisma.chatConversationState.findUnique.mockResolvedValue(row as never);

    const created = await repository.create(createInput);

    expect(created.id).toBe('state-1');
  });

  it('rethrows any other prisma error', async () => {
    prisma.chatConversationState.create.mockRejectedValue(prismaError('P2025'));

    await expect(repository.create(createInput)).rejects.toThrow();
  });

  it('updates the counters and the handoff state', async () => {
    prisma.chatConversationState.update.mockResolvedValue(row as never);
    const lastMessageAt = new Date();

    await repository.update('state-1', {
      lastTurnId: 'turn-2',
      messageCount: 3,
      lastMessageAt,
      handoffActive: true,
      handoffReason: 'COMPLAINT',
    });

    expect(prisma.chatConversationState.update).toHaveBeenCalledWith({
      where: { id: 'state-1' },
      data: expect.objectContaining({
        lastTurnId: 'turn-2',
        messageCount: 3,
        handoffActive: true,
        handoffReason: 'COMPLAINT',
      }),
    });
  });

  it('does not send handoff fields when they are not provided', async () => {
    prisma.chatConversationState.update.mockResolvedValue(row as never);

    await repository.update('state-1', {
      lastTurnId: 'turn-2',
      messageCount: 2,
      lastMessageAt: new Date(),
    });

    const data = prisma.chatConversationState.update.mock.calls[0][0].data as Record<string, unknown>;
    expect('handoffActive' in data).toBe(false);
    expect('handoffReason' in data).toBe(false);
  });
});
