import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Request, Response } from 'express';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { ChatController } from '../chat.controller';
import { ChatService } from '../chat.service';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: DeepMockProxy<ChatService>;

  beforeEach(async () => {
    chatService = mockDeep<ChatService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: chatService }],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('delegates the turn to the service and returns its reply', async () => {
    const request = { cookies: {} } as unknown as Request;
    const response = {} as unknown as Response;
    chatService.handle.mockResolvedValue({ conversationId: 'c', turnId: 't1', reply: { text: 'hola' } });

    const result = await controller.webChat({ message: { text: 'Hola' } }, request, response);

    expect(chatService.handle).toHaveBeenCalledWith({ message: { text: 'Hola' } }, request, response);
    expect(result.turnId).toBe('t1');
  });

  it('is public for the session guard and rate limited per ip', () => {
    const handler = ChatController.prototype.webChat;

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toBe(20);
    expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, handler)).toBe(60000);
  });
});
