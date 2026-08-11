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
}
