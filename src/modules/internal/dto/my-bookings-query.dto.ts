import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

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

  /**
   * `upcoming=true` returns only the bookings that start at or after this
   * moment, soonest first, so a long history cannot push the client's next
   * appointment out of the page. Validated as a string on purpose: query
   * values always arrive as strings.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  upcoming?: string;
}