import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitPaymentDto {
  @ApiProperty({ example: 'uuid-booking-123' })
  @IsString()
  @IsNotEmpty()
  bookingId: string;
}
