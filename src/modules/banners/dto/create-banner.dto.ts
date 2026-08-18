import { IsString, IsOptional, IsBoolean, IsInt, IsEnum, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BannerPosition } from '@prisma/client';

export class CreateBannerDto {
  @ApiPropertyOptional({ example: 'Halloween en Kamerinos' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: '20% de descuento en faciales todo el mes' })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiProperty({ example: '/uploads/banners/halloween/main.webp' })
  @IsString()
  imageUrl: string;

  @ApiPropertyOptional({ example: 'Ver promoción' })
  @IsOptional()
  @IsString()
  ctaText?: string;

  @ApiPropertyOptional({ example: '/servicios' })
  @IsOptional()
  @IsString()
  ctaLink?: string;

  @ApiPropertyOptional({ enum: BannerPosition, default: BannerPosition.HERO })
  @IsOptional()
  @IsEnum(BannerPosition)
  position?: BannerPosition;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  endsAt?: string;
}
