import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ManualPaymentDto {
  @ApiProperty({ example: 'uuid-booking-123' })
  @IsString()
  @IsNotEmpty()
  bookingId: string;

  @ApiProperty({ example: 'EFECTIVO', enum: ['EFECTIVO', 'TRANSFERENCIA'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['EFECTIVO', 'TRANSFERENCIA'])
  paymentMethod: string;
}
