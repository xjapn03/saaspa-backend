import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { TokenBlacklistService } from '../redis/token-blacklist.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ACCESS_COOKIE } from '../auth/cookies';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private tokenBlacklist: TokenBlacklistService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const canActivate = await super.canActivate(context);
    if (!canActivate) return false;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (token && (await this.tokenBlacklist.isBlacklisted(token))) {
      throw new UnauthorizedException('Token revocado. Inicia sesión de nuevo.');
    }

    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers?.authorization;
    if (header) return header.replace('Bearer ', '');
    return (request as any)?.cookies?.[ACCESS_COOKIE] ?? null;
  }
}
