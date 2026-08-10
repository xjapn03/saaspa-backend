import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ValidateCouponDto {
  @ApiProperty({ example: 'BIENVENIDA15', description: 'Código del cupón a validar' })
  @IsString()
  code: string;
}
