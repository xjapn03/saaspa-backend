import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { generateKeyPairSync } from 'crypto';
import { IssueTurnTokenInput } from '../interfaces/turn-token-payload';
import { TurnTokenService } from '../turn-token.service';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PRIVATE_B64 = Buffer.from(PRIVATE_PEM).toString('base64');
const BACKSLASH_N = String.fromCharCode(92) + 'n';
const PRIVATE_PEM_ESCAPED = PRIVATE_PEM.split(String.fromCharCode(10)).join(BACKSLASH_N);

const BASE_ENV: Record<string, string> = {
  TURN_TOKEN_PRIVATE_KEY: PRIVATE_B64,
  TURN_TOKEN_KID: 'kid-current',
  TURN_TOKEN_ISSUER: 'saaspa-backend',
  TURN_TOKEN_AUDIENCE: 'saaspa-ia',
  TURN_TOKEN_TTL_SECONDS: '300',
  TENANT_ID: 'kamerinos',
};

const TURN: IssueTurnTokenInput = {
  turnId: '11111111-1111-4111-8111-111111111111',
  conversationId: 'conv-abc',
  channel: 'WEB_WIDGET',
  agent: 'CLIENTAS',
};

async function buildModule(env: Record<string, string> = {}): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      TurnTokenService,
      JwtService,
      { provide: ConfigService, useValue: new ConfigService({ ...BASE_ENV, ...env }) },
    ],
  }).compile();
}

function tamperPayload(token: string): string {
  const [header, payload, signature] = token.split('.');
  const first = payload[0] === 'e' ? 'f' : 'e';
  return `${header}.${first}${payload.slice(1)}.${signature}`;
}

describe('TurnTokenService', () => {
  let service: TurnTokenService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module = await buildModule();
    service = module.get(TurnTokenService);
    jwtService = module.get(JwtService);
  });

  describe('issue', () => {
    it('signs an ES256 token with the configured kid', () => {
      const decoded = jwtService.decode(service.issue(TURN), { complete: true }) as any;

      expect(decoded.header.alg).toBe('ES256');
      expect(decoded.header.kid).toBe('kid-current');
      expect(decoded.header.typ).toBe('JWT');
    });

    it('includes the required claims signed by the backend', () => {
      const decoded = jwtService.decode(service.issue(TURN), { complete: true }) as any;
      const { payload } = decoded;

      expect(payload.jti).toBe(TURN.turnId);
      expect(payload.tenantId).toBe('kamerinos');
      expect(payload.conversationId).toBe('conv-abc');
      expect(payload.channel).toBe('WEB_WIDGET');
      expect(payload.agent).toBe('CLIENTAS');
      expect(payload.iss).toBe('saaspa-backend');
      expect(payload.aud).toBe('saaspa-ia');
      expect(payload.exp - payload.iat).toBe(300);
      expect(payload.userId).toBeUndefined();
      expect(payload.role).toBeUndefined();
    });

    it('includes userId and role only when provided', () => {
      const token = service.issue({ ...TURN, userId: 'user-1', role: 'CLIENTE' });
      const { payload } = jwtService.decode(token, { complete: true }) as any;

      expect(payload.userId).toBe('user-1');
      expect(payload.role).toBe('CLIENTE');
    });

    it('includes the trusted client IP only when it is provided', () => {
      const withIp = jwtService.decode(service.issue({ ...TURN, clientIp: '203.0.113.7' }), {
        complete: true,
      }) as any;
      expect(withIp.payload.clientIp).toBe('203.0.113.7');

      // A token emitted without an address keeps its previous shape.
      const withoutIp = jwtService.decode(service.issue(TURN), { complete: true }) as any;
      expect(withoutIp.payload.clientIp).toBeUndefined();
    });

    it('accepts the private key as raw PEM with escaped newlines', async () => {
      const module = await buildModule({ TURN_TOKEN_PRIVATE_KEY: PRIVATE_PEM_ESCAPED });
      const altService = module.get(TurnTokenService);

      expect(altService.verify(altService.issue(TURN)).jti).toBe(TURN.turnId);
    });

    it('fails with a clear error when the private key is missing', async () => {
      const module = await buildModule({ TURN_TOKEN_PRIVATE_KEY: '' });
      const altService = module.get(TurnTokenService);

      expect(() => altService.issue(TURN)).toThrow(/TURN_TOKEN_PRIVATE_KEY no configurada/);
    });

    it('fails with a clear error when the private key is not a valid EC PKCS#8 PEM', async () => {
      const module = await buildModule({
        TURN_TOKEN_PRIVATE_KEY: Buffer.from('not-a-key').toString('base64'),
      });
      const altService = module.get(TurnTokenService);

      expect(() => altService.issue(TURN)).toThrow(/no es una clave PKCS#8 EC/);
    });
  });

  describe('verify', () => {
    it('returns the payload of a token issued by the service', () => {
      const payload = service.verify(service.issue({ ...TURN, userId: 'user-1', role: 'CLIENTE' }));

      expect(payload.jti).toBe(TURN.turnId);
      expect(payload.tenantId).toBe('kamerinos');
      expect(payload.conversationId).toBe('conv-abc');
      expect(payload.channel).toBe('WEB_WIDGET');
      expect(payload.agent).toBe('CLIENTAS');
      expect(payload.userId).toBe('user-1');
      expect(payload.role).toBe('CLIENTE');
    });

    it('keeps the client IP claim and still accepts a token without it', () => {
      expect(service.verify(service.issue({ ...TURN, clientIp: '2001:db8::1' })).clientIp).toBe(
        '2001:db8::1',
      );
      // Optional: a token emitted before this claim existed stays valid.
      expect(service.verify(service.issue(TURN)).clientIp).toBeUndefined();
    });

    it('rejects an expired token', () => {
      const token = jwtService.sign({ ...TURN }, {
        privateKey: PRIVATE_PEM,
        algorithm: 'ES256',
        keyid: 'kid-current',
        issuer: 'saaspa-backend',
        audience: 'saaspa-ia',
        expiresIn: -10,
        jwtid: TURN.turnId,
      });

      expect(() => service.verify(token)).toThrow(UnauthorizedException);
    });

    it('rejects a token issued for another audience', () => {
      const token = jwtService.sign({ ...TURN }, {
        privateKey: PRIVATE_PEM,
        algorithm: 'ES256',
        keyid: 'kid-current',
        issuer: 'saaspa-backend',
        audience: 'another-service',
        jwtid: TURN.turnId,
      });

      expect(() => service.verify(token)).toThrow(UnauthorizedException);
    });

    it('rejects a token issued by another issuer', () => {
      const token = jwtService.sign({ ...TURN }, {
        privateKey: PRIVATE_PEM,
        algorithm: 'ES256',
        keyid: 'kid-current',
        issuer: 'someone-else',
        audience: 'saaspa-ia',
        jwtid: TURN.turnId,
      });

      expect(() => service.verify(token)).toThrow(UnauthorizedException);
    });

    it('rejects a token with an unknown kid', () => {
      const token = jwtService.sign({ ...TURN }, {
        privateKey: PRIVATE_PEM,
        algorithm: 'ES256',
        keyid: 'kid-rotated',
        issuer: 'saaspa-backend',
        audience: 'saaspa-ia',
        jwtid: TURN.turnId,
      });

      expect(() => service.verify(token)).toThrow(/kid desconocido/);
    });

    it('rejects a symmetric HS256 session token (algorithm confusion)', () => {
      const token = jwtService.sign({ ...TURN }, {
        secret: 'session-secret',
        algorithm: 'HS256',
        keyid: 'kid-current',
        issuer: 'saaspa-backend',
        audience: 'saaspa-ia',
        jwtid: TURN.turnId,
      });

      expect(() => service.verify(token)).toThrow(UnauthorizedException);
    });

    it('rejects a tampered token', () => {
      expect(() => service.verify(tamperPayload(service.issue(TURN)))).toThrow(UnauthorizedException);
    });

    it('rejects a malformed token', () => {
      expect(() => service.verify('not-a-jwt')).toThrow(UnauthorizedException);
    });

    it('rejects a token without the required claims', () => {
      const token = jwtService.sign(
        { tenantId: 'kamerinos', channel: 'WEB_WIDGET', agent: 'CLIENTAS' },
        {
          privateKey: PRIVATE_PEM,
          algorithm: 'ES256',
          keyid: 'kid-current',
          issuer: 'saaspa-backend',
          audience: 'saaspa-ia',
          jwtid: TURN.turnId,
        },
      );

      expect(() => service.verify(token)).toThrow(/incompleto/);
    });
  });
});
