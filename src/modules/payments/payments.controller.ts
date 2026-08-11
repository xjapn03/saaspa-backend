import {
  Controller, Get, Post, Param, Body, Headers, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { InitPaymentDto } from './dto/init-payment.dto';
import { Public } from '../../common/decorators/public.decorator';

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
