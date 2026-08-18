import { IsString, IsOptional, IsNumber, IsInt, IsBoolean, IsArray, Min } from 'class-validator';
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

  @ApiPropertyOptional({ example: 220000, description: 'Precio anterior para mostrar tachado' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  compareAtPrice?: number;

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

  @ApiPropertyOptional({ example: '/uploads/services/masaje/main.webp' })
  @IsOptional()
  @IsString()
  mainImage?: string;

  @ApiPropertyOptional({ type: [String], example: ['/uploads/services/masaje/gallery-1.webp'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  carouselImages?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Mostrar en destacados del home' })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}
