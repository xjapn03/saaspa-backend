import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createPrivateKey, createPublicKey } from 'crypto';
import { IssueTurnTokenInput, TurnTokenPayload } from './interfaces/turn-token-payload';

const DEFAULT_ISSUER = 'saaspa-backend';
const DEFAULT_AUDIENCE = 'saaspa-ia';
const DEFAULT_TTL_SECONDS = 300;

/**
 * Emits and verifies the short-lived turn token (ES256 / P-256) used between
 * this backend and saaspa-IA. The private key never leaves the environment: it
 * is read lazily from TURN_TOKEN_PRIVATE_KEY (base64 of a PKCS#8 PEM or the PEM
 * itself) and the public key is derived from it for verification.
 */
@Injectable()
export class TurnTokenService {
  private privateKeyPem?: string;
  private publicKeyPem?: string;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  get kid(): string {
    return this.configService.get<string>('TURN_TOKEN_KID') || '';
  }

  private get issuer(): string {
    return this.configService.get<string>('TURN_TOKEN_ISSUER') || DEFAULT_ISSUER;
  }

  private get audience(): string {
    return this.configService.get<string>('TURN_TOKEN_AUDIENCE') || DEFAULT_AUDIENCE;
  }

  private get ttlSeconds(): number {
    const raw = this.configService.get<string>('TURN_TOKEN_TTL_SECONDS');
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
  }

  issue(input: IssueTurnTokenInput): string {
    const tenantId = this.configService.get<string>('TENANT_ID');
    if (!tenantId) {
      throw new Error('TENANT_ID no configurado: no se puede emitir el turn token');
    }

    const payload: Record<string, unknown> = {
      tenantId,
      conversationId: input.conversationId,
      channel: input.channel,
      agent: input.agent,
    };
    if (input.userId) payload.userId = input.userId;
    if (input.role) payload.role = input.role;
    // Optional on purpose: it comes from the trusted proxy (`resolveClientIp`),
    // and a token without it stays valid for saaspa-IA (H-04 follow-up).
    if (input.clientIp) payload.clientIp = input.clientIp;

    return this.jwtService.sign(payload, {
      privateKey: this.loadPrivateKey(),
      algorithm: 'ES256',
      keyid: this.kid,
      issuer: this.issuer,
      audience: this.audience,
      expiresIn: this.ttlSeconds,
      jwtid: input.turnId,
    });
  }

  verify(token: string): TurnTokenPayload {
    const header = this.decodeHeader(token);
    if (header.kid !== this.kid) {
      throw new UnauthorizedException('Turn token con kid desconocido');
    }

    let payload: TurnTokenPayload;
    try {
      payload = this.jwtService.verify<TurnTokenPayload>(token, {
        publicKey: this.loadPublicKey(),
        algorithms: ['ES256'],
        issuer: this.issuer,
        audience: this.audience,
      });
    } catch {
      throw new UnauthorizedException('Turn token inválido o expirado');
    }

    if (
      !payload.jti ||
      !payload.tenantId ||
      !payload.conversationId ||
      !payload.channel ||
      !payload.agent
    ) {
      throw new UnauthorizedException('Turn token incompleto');
    }

    return payload;
  }

  private decodeHeader(token: string): { kid?: string; alg?: string } {
    try {
      const decoded = this.jwtService.decode(token, { complete: true }) as
        | { header?: { kid?: string; alg?: string } }
        | null;
      if (decoded?.header) return decoded.header;
    } catch {
      // A tampered token can carry a payload that is not valid JSON.
    }
    throw new UnauthorizedException('Turn token inválido');
  }

  /** Accepts a PEM whose newlines were escaped so it survives env vars. */
  private unescapeNewlines(pem: string): string {
    const backslash = String.fromCharCode(92);
    return pem.split(`${backslash}n`).join(String.fromCharCode(10));
  }

  private loadPrivateKey(): string {
    if (this.privateKeyPem) return this.privateKeyPem;

    const raw = this.configService.get<string>('TURN_TOKEN_PRIVATE_KEY');
    if (!raw) {
      throw new Error('TURN_TOKEN_PRIVATE_KEY no configurada: no se puede firmar el turn token');
    }

    const pem = raw.includes('-----BEGIN') ? this.unescapeNewlines(raw) : Buffer.from(raw, 'base64').toString('utf8');
    try {
      createPrivateKey(pem);
    } catch {
      throw new Error('TURN_TOKEN_PRIVATE_KEY no es una clave PKCS#8 EC (P-256) válida');
    }

    this.privateKeyPem = pem;
    return pem;
  }

  private loadPublicKey(): string {
    if (this.publicKeyPem) return this.publicKeyPem;

    const publicKey = createPublicKey(this.loadPrivateKey());
    this.publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    return this.publicKeyPem;
  }
}
