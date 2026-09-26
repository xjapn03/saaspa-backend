import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  NotImplementedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { IaBotClient, IaBotTurnRequest } from '../ia-bot.client';

describe('IaBotClient', () => {
  let client: IaBotClient;
  let fetchSpy: jest.SpyInstance;

  const turn: IaBotTurnRequest = {
    turnId: 't1',
    tenantId: 'kamerinos',
    conversationId: 'c1',
    channel: 'WEB_WIDGET',
    agent: 'CLIENTAS',
    identity: { kind: 'ANONYMOUS' },
    message: { text: 'Hola' },
    locale: 'es-CO',
    timezone: 'America/Bogota',
    now: '2026-10-01T08:00:00-05:00',
  };

  const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
  const errorResponse = (status: number, body: unknown) =>
    ({ ok: false, status, json: async () => body }) as never;

  async function build(env: Record<string, string> = {}) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IaBotClient,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            IA_BOT_URL: 'http://ia-bot:8000',
            IA_BOT_API_KEY: 'ia-key',
            IA_BOT_TIMEOUT_MS: '50',
            ...env,
          }),
        },
      ],
    }).compile();

    client = module.get<IaBotClient>(IaBotClient);
  }

  beforeEach(async () => {
    await build();
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okResponse({ turnId: 't1', reply: { text: 'ok' } }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('posts the turn with the service key and the turn token', async () => {
    await client.chat(turn, 'turn-token');

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://ia-bot:8000/api/v1/chat');
    expect(options.method).toBe('POST');
    expect(options.headers['X-Internal-Api-Key']).toBe('ia-key');
    expect(options.headers.Authorization).toBe('Bearer turn-token');
    expect(JSON.parse(options.body)).toEqual(turn);
  });

  it('returns the parsed response', async () => {
    const result = await client.chat(turn, 'turn-token');

    expect(result.reply?.text).toBe('ok');
  });

  it('uses the default URL when IA_BOT_URL is not configured', async () => {
    await build({ IA_BOT_URL: '' });
    fetchSpy.mockResolvedValue(okResponse({}));

    await client.chat(turn, 'turn-token');

    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:8000/api/v1/chat');
  });

  it('maps a 400 to BadRequestException with the ProblemDetail detail', async () => {
    fetchSpy.mockResolvedValue(errorResponse(400, { detail: 'tenantId no coincide' }));

    await expect(client.chat(turn, 'turn-token')).rejects.toThrow(BadRequestException);
    await expect(client.chat(turn, 'turn-token')).rejects.toThrow('tenantId no coincide');
  });

  it('maps a 501 to NotImplementedException', async () => {
    fetchSpy.mockResolvedValue(errorResponse(501, { detail: 'agente ADMIN no implementado' }));

    await expect(client.chat(turn, 'turn-token')).rejects.toThrow(NotImplementedException);
  });

  it('maps an upstream 500 to BadGatewayException', async () => {
    fetchSpy.mockResolvedValue(errorResponse(500, {}));

    await expect(client.chat(turn, 'turn-token')).rejects.toThrow(BadGatewayException);
  });

  it('maps a network failure to BadGatewayException', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(client.chat(turn, 'turn-token')).rejects.toThrow(BadGatewayException);
  });

  it('maps a timeout to GatewayTimeoutException', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    fetchSpy.mockRejectedValue(abortError);

    await expect(client.chat(turn, 'turn-token')).rejects.toThrow(GatewayTimeoutException);
  });
});
