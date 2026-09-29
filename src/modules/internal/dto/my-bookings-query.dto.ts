import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query parameters of GET /api/internal/v1/me/bookings. The subject (which user's
 * bookings) never travels here: it comes from the turn token (ADR 0012).
 */
export class MyBookingsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** Bookings per page; 20 by default (the repository default), 50 at most. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}