import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from '../whatsapp.service';
import { PrismaService } from '../../../database/prisma.service';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let prisma: DeepMockProxy<PrismaService>;
  let fetchSpy: jest.SpyInstance;

  const configValues: Record<string, string> = {
    'meta.whatsappVerifyToken': 'kamerinos_webhook_2026',
    'meta.whatsappPhoneNumberId': '1224891990711739',
    'meta.whatsappAccessToken': 'EAATestToken',
    'frontend.url': 'https://kamerinos.sandrapinzonsaludybelleza.com.co',
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const config = { get: jest.fn((key: string) => configValues[key]) };
    fetchSpy = jest
      .spyOn(global as any, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({}) } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should verify subscription with correct token', () => {
    expect(service.verifySubscription('subscribe', 'kamerinos_webhook_2026')).toBe(true);
  });

  it('should reject a wrong token', () => {
    expect(service.verifySubscription('subscribe', 'wrong')).toBe(false);
  });

  it('should reject a non-subscribe mode', () => {
    expect(service.verifySubscription('unsubscribe', 'kamerinos_webhook_2026')).toBe(false);
  });

  it('should reject when verify token is not configured', () => {
    const emptyConfig = {
      get: jest.fn((key: string) =>
        key === 'meta.whatsappVerifyToken' ? '' : configValues[key],
      ),
    };
    const svc = new WhatsappService(emptyConfig as any, prisma as any);
    expect(svc.verifySubscription('subscribe', 'kamerinos_webhook_2026')).toBe(false);
  });

  it('should parse an incoming message value', () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '1224891990711739' },
                contacts: [{ wa_id: '573000000000' }],
                messages: [{ text: { body: 'hola' } }],
              },
            },
          ],
        },
      ],
    };

    const parsed = service.parseIncomingMessage(body);

    expect(parsed?.waId).toBe('573000000000');
    expect(parsed?.text).toBe('hola');
    expect(parsed?.phoneNumberId).toBe('1224891990711739');
  });

  it('should return null when payload has no value', () => {
    expect(service.parseIncomingMessage({})).toBeNull();
  });

  it('should create conversation state and send welcome menu on first contact', async () => {
    (prisma.conversationState.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.conversationState.create as jest.Mock).mockResolvedValue({ id: '1' });

    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '1224891990711739' },
                contacts: [{ wa_id: '573000000000' }],
                messages: [{ text: { body: 'hola' } }],
              },
            },
          ],
        },
      ],
    };

    await service.handleIncoming(body);

    expect(prisma.conversationState.create).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should send booking link when AGENDAR button is pressed', async () => {
    (prisma.conversationState.findUnique as jest.Mock).mockResolvedValue({
      id: '1',
      waId: '573000000000',
      state: { greeted: true },
    });

    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '1224891990711739' },
                contacts: [{ wa_id: '573000000000' }],
                messages: [{ interactive: { button_reply: { id: 'AGENDAR' } } }],
              },
            },
          ],
        },
      ],
    };

    await service.handleIncoming(body);

    const call = fetchSpy.mock.calls[0];
    expect(String(call[1].body)).toContain('/agendar');
  });
});
