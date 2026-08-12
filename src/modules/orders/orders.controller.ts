import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { OrdersService } from './orders.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Listar todos los pedidos (Admin)' })
  @ApiQuery({ name: 'search', required: false, description: 'Buscar por nombre o email del cliente' })
  @ApiQuery({ name: 'status', required: false, description: 'Filtrar por estado (PENDIENTE, CONFIRMADO, ENVIADO, ENTREGADO, CANCELADO)' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Fecha desde (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Fecha hasta (YYYY-MM-DD)' })
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.ordersService.findAll({ search, status, dateFrom, dateTo });
  }

  @Get('my')
  @ApiOperation({ summary: 'Mis pedidos (Cliente autenticado)' })
  findMyOrders(@CurrentUser('id') userId: string) {
    return this.ordersService.findByUser(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de pedido' })
  findById(@Param('id') id: string) { return this.ordersService.findById(id); }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar estado del pedido (Admin)' })
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.ordersService.updateStatus(id, status);
  }
}
