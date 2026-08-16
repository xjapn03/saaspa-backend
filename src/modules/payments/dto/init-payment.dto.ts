import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitPaymentDto {
  @ApiProperty({ example: 'uuid-booking-123' })
  @IsString()
  @IsNotEmpty()
  bookingId: string;

  @ApiPropertyOptional({ example: 'ABONO', enum: ['ABONO', 'SALDO'], default: 'ABONO' })
  @IsOptional()
  @IsString()
  @IsIn(['ABONO', 'SALDO'])
  type?: string;

  @ApiPropertyOptional({ description: 'Flag para pagar el total (100%) en vez del abono' })
  @IsOptional()
  payFull?: boolean;

  @ApiPropertyOptional({ description: 'Meta click id (_fbc) para atribución CAPI' })
  @IsOptional()
  @IsString()
  fbc?: string;

  @ApiPropertyOptional({ description: 'Meta browser id (_fbp) para atribución CAPI' })
  @IsOptional()
  @IsString()
  fbp?: string;

  @ApiPropertyOptional({ description: 'event_id para deduplicación Pixel/CAPI' })
  @IsOptional()
  @IsString()
  eventId?: string;
}
