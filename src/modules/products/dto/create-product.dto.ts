import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsArray, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'Crema Hidratante Premium' })
  @IsString() @IsNotEmpty() @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'crema-hidratante-premium' })
  @IsString() @IsNotEmpty() @MaxLength(200)
  slug: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ example: 85000 })
  @IsNumber() @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 120000, description: 'Precio original (tachado)' })
  @IsOptional() @IsNumber() @Min(0)
  compareAtPrice?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional() @IsNumber() @Min(0)
  stock?: number;

  @ApiPropertyOptional({ example: 'SKU-001' })
  @IsOptional() @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: 'https://example.com/main.jpg' })
  @IsOptional() @IsString()
  mainImage?: string;

  @ApiPropertyOptional({ example: ['url1.jpg', 'url2.jpg'], description: 'Array de URLs para galería' })
  @IsOptional() @IsArray()
  carouselImages?: string[];

  @ApiPropertyOptional({ example: 'Loreal', description: 'Marca/fabricante' })
  @IsOptional() @IsString()
  sponsor?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ example: 'uuid-category' })
  @IsOptional() @IsString()
  categoryId?: string;
}
