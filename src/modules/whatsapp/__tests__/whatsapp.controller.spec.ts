import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappController } from '../whatsapp.controller';
import { WhatsappService } from '../whatsapp.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let whatsappService: {
    verifySubscription: jest.Mock;
    handleIncoming: jest.Mock;
  };

  beforeEach(async () => {
    whatsappService = {
      verifySubscription: jest.fn(),
      handleIncoming: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        { provide: WhatsappService, useValue: whatsappService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<WhatsappController>(WhatsappController);
  });

  it('should return 200 with challenge when verification succeeds', () => {
    whatsappService.verifySubscription.mockReturnValue(true);
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const req = {
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'kamerinos_webhook_2026',
        'hub.challenge': 'challenge-123',
      },
    };

    controller.verify(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('challenge-123');
  });

  it('should return 403 when verification fails', () => {
    whatsappService.verifySubscription.mockReturnValue(false);
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    const req = {
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'challenge-123',
      },
    };

    controller.verify(req as any, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Forbidden');
  });

  it('should acknowledge POST with 200 and process incoming', () => {
    const res = { sendStatus: jest.fn() };
    const req = { body: { entry: [] } };

    controller.receive(req as any, res as any);

    expect(whatsappService.handleIncoming).toHaveBeenCalledWith(req.body);
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });
});
