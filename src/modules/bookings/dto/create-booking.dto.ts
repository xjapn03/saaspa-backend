import { IsString, IsISO8601, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({ example: 'uuid-service-123' })
  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @ApiProperty({ example: '2026-08-15T10:00:00.000Z', description: 'ISO 8601 fecha+hora UTC' })
  @IsISO8601({ strict: true })
  @IsNotEmpty()
  startTime: string;
}
