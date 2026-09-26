import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query parameters of GET /api/internal/v1/services.
 * `featured` is validated as a string on purpose: query values always arrive as
 * strings, so anything that is not true/false must be rejected instead of coerced.
 */
export class ListInternalServicesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(['true', 'false'])
  featured?: string;
}
