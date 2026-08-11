import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener carrito del usuario autenticado' })
  getCart(@CurrentUser('id') userId: string) {
    return this.cartService.getCart(userId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Agregar o actualizar item en el carrito' })
  addItem(@CurrentUser('id') userId: string, @Body() body: { productId: string; quantity?: number }) {
    return this.cartService.addItem(userId, body.productId, body.quantity || 1);
  }

  @Patch('items/:productId')
  @ApiOperation({ summary: 'Actualizar cantidad de un item' })
  updateQuantity(@CurrentUser('id') userId: string, @Param('productId') productId: string, @Body() body: { quantity: number }) {
    return this.cartService.updateQuantity(userId, productId, body.quantity);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Eliminar item del carrito' })
  removeItem(@CurrentUser('id') userId: string, @Param('productId') productId: string) {
    return this.cartService.removeItem(userId, productId);
  }

  @Delete()
  @ApiOperation({ summary: 'Vaciar carrito' })
  clearCart(@CurrentUser('id') userId: string) {
    return this.cartService.clearCart(userId);
  }

  @Post('merge')
  @ApiOperation({ summary: 'Merge carrito guest al hacer login' })
  mergeCart(@CurrentUser('id') userId: string, @Body() body: { items: { productId: string; quantity: number }[] }) {
    return this.cartService.mergeCart(userId, body.items);
  }
}
