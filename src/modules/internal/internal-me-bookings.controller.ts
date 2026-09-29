import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { DEFAULT_TIMEZONE, toOffsetIso } from '../../common/time/timezone.util';
import { IBookingSafe } from '../../repositories/interfaces/bookings.repository';
import { BookingsService } from '../bookings/bookings.service';
import { TurnContext } from './decorators/turn-context.decorator';
import { MyBookingsQueryDto } from './dto/my-bookings-query.dto';
import { InternalAuthGuard } from './guards/internal-auth.guard';
import { TurnTokenPayload } from './interfaces/turn-token-payload';
import { requireTurnUser } from './turn-identity';

/**
 * misCitas: the bookings of the client identified by the turn token (Fase 2, read
 * only). Mirrors the CLIENTE filter of GET /api/bookings, but the subject comes
 * from the turn token, never from the query, and the payload is trimmed to what
 * the assistant needs: no user data, no notes, no idempotency key, no calendar
 * internals.
 *
 * `EXPIRADA` (the payment window closed) and `PAGO_TARDE` (payment approved
 * without a free slot) are returned on purpose: the assistant has to be able to
 * explain them (H-06).
 *
 * Contract: saaspa-IA/docs/contracts/internal-api.openapi.yaml.
 * @Public() only skips the user session guard; InternalAuthGuard is the real
 * gate and authorizes with the identity of the turn token.
 */
@ApiExcludeController()
@Controller('internal/v1/me/bookings')
@Public()
@SkipThrottle()
@UseGuards(InternalAuthGuard)
export class InternalMeBookingsController {
  constructor(
    private bookingsService: BookingsService,
    private configService: ConfigService,
  ) {}

  @Get()
  async myBookings(@TurnContext() turn: TurnTokenPayload, @Query() query: MyBookingsQueryDto) {
    // 403 when the turn is anonymous: an unidentified chat cannot read a client's
    // bookings (ADR 0012 points 1 and 2).
    const subject = requireTurnUser(turn);

    // Default: the whole history, latest `startTime` first — any upcoming booking
    // sorts before any past one. `upcoming=true` narrows it to the bookings that
    // start at or after this moment, soonest first, so a long history can never
    // push the client's next appointment out of the page.
    const result = await this.bookingsService.findAll(
      query.upcoming === 'true'
        ? {
            userId: subject.userId,
            from: new Date(),
            sortBy: 'startTime',
            order: 'asc',
            page: query.page,
            limit: query.limit,
          }
        : { userId: subject.userId, page: query.page, limit: query.limit },
    );

    const timezone = this.configService.get<string>('TENANT_TIMEZONE') || DEFAULT_TIMEZONE;

    return {
      timezone,
      bookings: result.data.map((booking) => this.toContractBooking(booking, timezone)),
      // Signal that there are more results beyond this page, so the assistant
      // can ask for the next one instead of assuming the list is complete.
      hasMore: result.page * result.limit < result.total,
    };
  }

  /**
   * Exactly the fields of the contract. `start` and `end` carry an explicit UTC
   * offset in the tenant time zone, the same convention as /availability, so
   * saaspa-IA never has to guess a time zone (R-06.b).
   */
  private toContractBooking(booking: IBookingSafe, timezone: string) {
    return {
      id: booking.id,
      serviceId: booking.serviceId,
      serviceName: booking.service?.name ?? '',
      price: Number(booking.service?.price ?? 0),
      start: toOffsetIso(new Date(booking.startTime), timezone),
      end: toOffsetIso(new Date(booking.endTime), timezone),
      status: booking.status,
    };
  }
}