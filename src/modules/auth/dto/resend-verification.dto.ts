import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendVerificationDto {
  @ApiProperty({ example: 'maria@email.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
