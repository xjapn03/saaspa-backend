import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { TurnContext } from '../decorators/turn-context.decorator';
import { TurnTokenPayload } from '../interfaces/turn-token-payload';
import { requireTurnUser } from '../turn-identity';

const payload: TurnTokenPayload = {
  iss: 'saaspa-backend',
  aud: 'saaspa-ia',
  iat: 1760000000,
  exp: 1760000300,
  jti: 'turn-1',
  tenantId: 'kamerinos',
  conversationId: 'c1',
  channel: 'WEB_LOGGED',
  agent: 'CLIENTAS',
  userId: 'user-7',
  role: 'CLIENTE',
};

/** Nest calls the factory of a custom param decorator with (data, context). */
function factoryOf(decorator: () => ParameterDecorator) {
  class Probe {
    handler(@decorator() value: unknown): unknown {
      return value;
    }
  }

  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler');
  const key = Object.keys(metadata)[0];

  return metadata[key].factory as (data: unknown, context: ExecutionContext) => unknown;
}

const contextWith = (request: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

describe('@TurnContext', () => {
  it('returns the payload the guard verified', () => {
    expect(factoryOf(TurnContext)(undefined, contextWith({ turn: payload }))).toBe(payload);
  });

  it('returns a single claim when it is asked for one', () => {
    expect(factoryOf(TurnContext)('userId', contextWith({ turn: payload }))).toBe('user-7');
    expect(factoryOf(TurnContext)('conversationId', contextWith({ turn: payload }))).toBe('c1');
  });

  it('returns undefined instead of throwing when the guard did not run', () => {
    expect(factoryOf(TurnContext)('userId', contextWith({}))).toBeUndefined();
  });
});

describe('requireTurnUser (ADR 0012)', () => {
  it('resolves the subject from the turn token', () => {
    expect(requireTurnUser(payload)).toEqual({ userId: 'user-7', role: 'CLIENTE' });
  });

  it('keeps the staff role of the turn', () => {
    expect(requireTurnUser({ ...payload, role: 'ADMIN' })).toEqual({
      userId: 'user-7',
      role: 'ADMIN',
    });
  });

  it('rejects an anonymous turn with 403', () => {
    expect(() => requireTurnUser({ ...payload, userId: undefined })).toThrow(ForbiddenException);
  });

  it('rejects a missing turn with 403, so a write can never happen without identity', () => {
    expect(() => requireTurnUser(undefined)).toThrow(ForbiddenException);
  });
});
