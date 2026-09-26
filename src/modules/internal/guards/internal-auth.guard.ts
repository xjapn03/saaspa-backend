import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { TurnTokenService } from '../turn-token.service';
import { TurnTokenPayload } from '../interfaces/turn-token-payload';

export type TurnRequest = Request & { turn?: TurnTokenPayload };

/**
 * Guard for /api/internal/v1/*.
 *
 * Requires the service key (X-Internal-Api-Key = INTERNAL_API_KEY, the IA -> backend
 * direction) AND a valid turn token in Authorization: Bearer. Authorization uses the
 * identity inside the token only; request parameters are never trusted.
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private turnTokenService: TurnTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TurnRequest>();

    this.assertServiceKey(request);
    const payload = this.assertTurnToken(request);

    const tenantId = this.configService.get<string>('TENANT_ID');
    if (tenantId && payload.tenantId !== tenantId) {
      throw new ForbiddenException('Tenant no permitido');
    }

    request.turn = payload;
    return true;
  }

  private assertServiceKey(request: TurnRequest): void {
    const header = request.headers['x-internal-api-key'];
    const provided = Array.isArray(header) ? header[0] : header;
    const expected = this.configService.get<string>('INTERNAL_API_KEY') || '';

    if (!expected || !provided || !this.safeEquals(provided, expected)) {
      throw new UnauthorizedException('Clave de servicio inválida');
    }
  }

  private assertTurnToken(request: TurnRequest): TurnTokenPayload {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Turn token ausente');
    }
    return this.turnTokenService.verify(header.slice('Bearer '.length).trim());
  }

  private safeEquals(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
  }
}
