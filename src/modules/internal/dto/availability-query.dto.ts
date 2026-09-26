import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Query parameters of GET /api/internal/v1/availability.
 * `serviceId` accepts a UUID or a slug; `date` is validated as a real calendar
 * date in the controller (see isValidCalendarDate).
 */
export class AvailabilityQueryDto {
  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @IsString()
  @IsNotEmpty()
  date: string;
}
