import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BookingsModule } from '../bookings/bookings.module';
import { ServicesModule } from '../services/services.module';
import { InternalAvailabilityController } from './internal-availability.controller';
import { InternalMeBookingsController } from './internal-me-bookings.controller';
import { InternalServicesController } from './internal-services.controller';
import { InternalAuthGuard } from './guards/internal-auth.guard';
import { TurnTokenService } from './turn-token.service';

/**
 * Service-to-service authentication with saaspa-IA: issues the turn token
 * (ES256), guards /api/internal/v1/* and exposes the read-only endpoints of
 * Fase 1 by wrapping the real services, plus misCitas (Fase 2 read).
 */
@Module({
  imports: [JwtModule.register({}), ServicesModule, BookingsModule],
  controllers: [InternalServicesController, InternalAvailabilityController, InternalMeBookingsController],
  providers: [TurnTokenService, InternalAuthGuard],
  exports: [TurnTokenService, InternalAuthGuard],
})
export class InternalModule {}

