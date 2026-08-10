import { IsString, IsNumber, IsDateString, IsOptional, Min, Max, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCouponDto {
  @ApiProperty({ example: 'BIENVENIDA15', description: 'Código único del cupón' })
  @IsString()
  @Length(3, 30)
  code: string;

  @ApiProperty({ example: 0.15, description: 'Porcentaje de descuento (0.15 = 15%)' })
  @IsNumber()
  @Min(0.01)
  @Max(1.0)
  discount: number;

  @ApiProperty({ example: '2026-12-31', description: 'Fecha de expiración' })
  @IsDateString()
  expiresAt: string;

  @ApiPropertyOptional({ example: 'user-uuid', description: 'Usuario al que se asigna (opcional)' })
  @IsOptional()
  @IsString()
  userId?: string;
}
