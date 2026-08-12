import { IsArray, IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CartItemDto {
  @ApiProperty({ example: 'uuid-product-1' })
  @IsString()
  productId: string;

  @ApiProperty({ example: 'Crema Hidratante' })
  @IsString()
  name: string;

  @ApiProperty({ example: 85000 })
  @IsNumber()
  price: number;

  @ApiProperty({ example: 2 })
  @IsNumber()
  quantity: number;
}

export class InitCartPaymentDto {
  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  items: CartItemDto[];

  @ApiPropertyOptional({ example: 'DESCUENTO10' })
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional({ example: 'uuid-coupon' })
  @IsOptional()
  @IsString()
  couponId?: string;

  @ApiPropertyOptional({ example: 'Maria Gomez' })
  @IsOptional()
  @IsString()
  shippingName?: string;

  @ApiPropertyOptional({ example: 'maria@ejemplo.com' })
  @IsOptional()
  @IsString()
  shippingEmail?: string;

  @ApiPropertyOptional({ example: '3001234567' })
  @IsOptional()
  @IsString()
  shippingPhone?: string;

  @ApiPropertyOptional({ example: 'Calle 123 #45-67' })
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @ApiPropertyOptional({ example: 'Bogota' })
  @IsOptional()
  @IsString()
  shippingCity?: string;

  @ApiPropertyOptional({ example: 'Entregar en porteria' })
  @IsOptional()
  @IsString()
  shippingNotes?: string;
}
