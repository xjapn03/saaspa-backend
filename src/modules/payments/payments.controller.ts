import {
  Controller, Get, Post, Param, Body, Headers, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { InitPaymentDto } from './dto/init-payment.dto';
import { InitCartPaymentDto } from './dto/init-cart-payment.dto';
import { ManualPaymentDto } from './dto/manual-payment.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('init')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Iniciar pago — retorna config para widget Wompi. type=ABONO (default) o SALDO' })
  @ApiResponse({ status: 201, description: 'Configuración de pago generada' })
  init(@Body() dto: InitPaymentDto) {
    return this.paymentsService.initPayment(dto.bookingId, (dto.type as 'ABONO' | 'SALDO') || 'ABONO');
  }

  @Post('init-cart')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Iniciar pago del carrito de compras' })
  @ApiResponse({ status: 201, description: 'Configuración de pago generada' })
  initCart(@CurrentUser('id') userId: string, @Body() dto: InitCartPaymentDto) {
    return this.paymentsService.initCartPayment(userId, dto);
  }

  @Get('transactions')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Historial de todas las transacciones (Admin)' })
  @ApiQuery({ name: 'search', required: false, description: 'Buscar por nombre, email o referencia' })
  @ApiQuery({ name: 'type', required: false, description: 'ABONO o SALDO' })
  @ApiQuery({ name: 'status', required: false, description: 'PENDIENTE, APROBADO, RECHAZADO, REEMBOLSADO' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAllTransactions(
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentsService.findAllTransactions({ search, type, status, dateFrom, dateTo, page: page ? parseInt(page) : undefined, limit: limit ? parseInt(limit) : undefined });
  }

  @Get('revenue')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ingresos netos del mes (Admin)' })
  @ApiQuery({ name: 'month', required: true, example: '2026-08', description: 'YYYY-MM' })
  getRevenue(@Query('month') month: string) {
    return this.paymentsService.getRevenue(month);
  }

  @Post('manual')
  @Roles(Role.ADMIN, Role.EMPLEADO)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registrar pago manual (efectivo/transferencia) para una cita' })
  @ApiResponse({ status: 201, description: 'Pago registrado' })
  manualPayment(@Body() dto: ManualPaymentDto) {
    return this.paymentsService.manualPayment(dto.bookingId, dto.paymentMethod);
  }

  @Get(':bookingId/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consultar estado de pago de una cita' })
  getStatus(@Param('bookingId') bookingId: string) {
    return this.paymentsService.getPaymentStatus(bookingId);
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook de Wompi — confirma pagos' })
  @ApiResponse({ status: 200, description: 'Evento recibido' })
  async webhook(
    @Body() body: any,
    @Headers('x-event-checksum') checksum: string,
  ) {
    return this.paymentsService.handleWebhook(body, checksum);
  }
}
