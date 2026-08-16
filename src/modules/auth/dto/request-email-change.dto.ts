import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestEmailChangeDto {
  @ApiProperty({ example: 'nuevo@correo.com' })
  @IsEmail()
  @IsString()
  newEmail: string;
}
