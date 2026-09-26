import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { isUuid } from '../../common/identifiers/uuid.util';
import { DEFAULT_TIMEZONE, isValidCalendarDate, toOffsetIso } from '../../common/time/timezone.util';
import { BookingsService } from '../bookings/bookings.service';
import { ServicesService } from '../services/services.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { InternalAuthGuard } from './guards/internal-auth.guard';

/**
 * Availability for one day for saaspa-IA (Fase 1). Mirrors GET /api/bookings/slots
 * (single global agenda, no staff) but returns explicit UTC offsets plus the
 * time zone, because the real computation uses the container local time.
 *
 * Contract: saaspa-IA/docs/contracts/internal-api.openapi.yaml.
 */
@ApiExcludeController()
@Controller('internal/v1/availability')
@Public()
@SkipThrottle()
@UseGuards(InternalAuthGuard)
export class InternalAvailabilityController {
  constructor(
    private servicesService: ServicesService,
    private bookingsService: BookingsService,
    private configService: ConfigService,
  ) {}

  @Get()
  async getAvailability(@Query() query: AvailabilityQueryDto) {
    if (!isValidCalendarDate(query.date)) {
      throw new BadRequestException('date debe tener el formato YYYY-MM-DD y ser una fecha válida');
    }

    const service = isUuid(query.serviceId)
      ? await this.servicesService.findById(query.serviceId)
      : await this.servicesService.findBySlug(query.serviceId);

    const timezone = this.configService.get<string>('TENANT_TIMEZONE') || DEFAULT_TIMEZONE;
    const window = await this.bookingsService.getAvailabilityWindow(service.id, query.date);

    return {
      serviceId: service.id,
      date: query.date,
      timezone,
      slots: window.slots.map((slot) => ({
        start: toOffsetIso(slot.start, timezone),
        end: toOffsetIso(slot.end, timezone),
      })),
    };
  }
}
