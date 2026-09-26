import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync } from 'crypto';
import { InternalAuthGuard, TurnRequest } from '../guards/internal-auth.guard';
import { IssueTurnTokenInput } from '../interfaces/turn-token-payload';
import { TurnTokenService } from '../turn-token.service';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const BASE_ENV: Record<string, string> = {
  TURN_TOKEN_PRIVATE_KEY: Buffer.from(PRIVATE_PEM).toString('base64'),
  TURN_TOKEN_KID: 'kid-current',
  TURN_TOKEN_ISSUER: 'saaspa-backend',
  TURN_TOKEN_AUDIENCE: 'saaspa-ia',
  TURN_TOKEN_TTL_SECONDS: '300',
  TENANT_ID: 'kamerinos',
  INTERNAL_API_KEY: 'internal-key',
};

const TURN: IssueTurnTokenInput = {
  turnId: '11111111-1111-4111-8111-111111111111',
  conversationId: 'conv-abc',
  channel: 'WEB_WIDGET',
  agent: 'CLIENTAS',
};

async function buildGuard(env: Record<string, string> = {}) {
  const module = await Test.createTestingModule({
    providers: [
      InternalAuthGuard,
      TurnTokenService,
      JwtService,
      { provide: ConfigService, useValue: new ConfigService({ ...BASE_ENV, ...env }) },
    ],
  }).compile();

  return {
    guard: module.get(InternalAuthGuard),
    tokens: module.get(TurnTokenService),
    jwtService: module.get(JwtService),
  };
}

function contextFor(headers: Record<string, string | undefined>): {
  context: ExecutionContext;
  request: TurnRequest;
} {
  const request = { headers } as unknown as TurnRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('InternalAuthGuard', () => {
  let guard: InternalAuthGuard;
  let tokens: TurnTokenService;
  let jwtService: JwtService;

  const serviceKey = 'internal-key';
  const validToken = (input: Partial<IssueTurnTokenInput> = {}) => tokens.issue({ ...TURN, ...input });
  const authorized = (token: string) => ({ 'x-internal-api-key': serviceKey, authorization: `Bearer ${token}` });

  beforeEach(async () => {
    ({ guard, tokens, jwtService } = await buildGuard());
  });

  it('rejects a request without the service key header', () => {
    const { context } = contextFor({ authorization: `Bearer ${validToken()}` });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a request with a wrong service key', () => {
    const { context } = contextFor({ 'x-internal-api-key': 'wrong-key', authorization: `Bearer ${validToken()}` });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('fails closed when INTERNAL_API_KEY is not configured', async () => {
    const { guard: unconfiguredGuard } = await buildGuard({ INTERNAL_API_KEY: '' });
    const { context } = contextFor(authorized(validToken()));

    expect(() => unconfiguredGuard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a request without the Authorization header', () => {
    const { context } = contextFor({ 'x-internal-api-key': serviceKey });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects an Authorization header without the Bearer prefix', () => {
    const { context } = contextFor({ 'x-internal-api-key': serviceKey, authorization: validToken() });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a session HS256 token used as a turn token', () => {
    const sessionToken = jwtService.sign({ sub: 'user-1', email: 'a@b.co', role: 'CLIENTE' }, {
      secret: 'session-secret',
      algorithm: 'HS256',
      keyid: 'kid-current',
      issuer: 'saaspa-backend',
      audience: 'saaspa-ia',
    });
    const { context } = contextFor(authorized(sessionToken));

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects an expired turn token', () => {
    const expired = jwtService.sign({ ...TURN }, {
      privateKey: PRIVATE_PEM,
      algorithm: 'ES256',
      keyid: 'kid-current',
      issuer: 'saaspa-backend',
      audience: 'saaspa-ia',
      expiresIn: -10,
      jwtid: TURN.turnId,
    });
    const { context } = contextFor(authorized(expired));

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a turn token whose tenantId does not match TENANT_ID', () => {
    const foreignTenantToken = jwtService.sign(
      { ...TURN, tenantId: 'otro' },
      {
        privateKey: PRIVATE_PEM,
        algorithm: 'ES256',
        keyid: 'kid-current',
        issuer: 'saaspa-backend',
        audience: 'saaspa-ia',
        jwtid: TURN.turnId,
      },
    );
    const { context } = contextFor(authorized(foreignTenantToken));

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows a valid request and attaches the verified turn payload', () => {
    const token = validToken({ userId: 'user-1', role: 'CLIENTE' });
    const { context, request } = contextFor(authorized(token));

    expect(guard.canActivate(context)).toBe(true);
    expect(request.turn).toMatchObject({
      jti: TURN.turnId,
      tenantId: 'kamerinos',
      conversationId: 'conv-abc',
      channel: 'WEB_WIDGET',
      agent: 'CLIENTAS',
      userId: 'user-1',
      role: 'CLIENTE',
    });
  });
});
