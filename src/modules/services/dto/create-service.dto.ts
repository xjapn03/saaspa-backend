import { IsString, IsOptional, IsNumber, IsInt, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateServiceDto {
  @ApiProperty({ example: 'Facial Hidratante Premium' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'facial-hidratante-premium', description: 'Slug único (auto-generado del nombre si no se envía)' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 180000 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: 75, description: 'Duración en minutos' })
  @IsInt()
  @Min(1)
  duration: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
