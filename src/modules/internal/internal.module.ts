import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InternalAuthGuard } from './guards/internal-auth.guard';
import { TurnTokenService } from './turn-token.service';

/**
 * Service-to-service authentication with saaspa-IA: issues the turn token
 * (ES256) and guards the /api/internal/v1/* routes. The controllers that use
 * the guard live in this module.
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [TurnTokenService, InternalAuthGuard],
  exports: [TurnTokenService, InternalAuthGuard],
})
export class InternalModule {}
