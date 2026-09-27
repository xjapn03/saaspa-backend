import {
  Controller, Get, Post, Patch, Param, Body, Query, Headers, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { BookingsService } from './bookings.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(
    private bookingsService: BookingsService,
    private paymentsService: PaymentsService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar citas — admin/empleado ve todas, cliente ve las suyas' })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'order', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Query('date') date?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const filters: any = { date, status, search, sortBy, order };
    if (role === 'CLIENTE') filters.userId = userId;
    if (page) filters.page = parseInt(page, 10);
    if (limit) filters.limit = parseInt(limit, 10);
    return this.bookingsService.findAll(filters);
  }

  @Get('slots')
  @Public()
  @ApiOperation({ summary: 'Consultar slots disponibles para un servicio en una fecha' })
  @ApiQuery({ name: 'serviceId', required: true })
  @ApiQuery({ name: 'date', required: true, example: '2026-08-15' })
  getAvailability(
    @Query('serviceId') serviceId: string,
    @Query('date') date: string,
  ) {
    return this.bookingsService.getAvailability(serviceId, date);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener detalle de cita' })
  findById(@Param('id') id: string) {
    return this.bookingsService.findById(id);
  }

  @Get(':id/balance')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consultar balance de pagos de una cita' })
  getBalance(@Param('id') id: string) {
    return this.paymentsService.getPaymentStatus(id);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear cita (status: PENDIENTE_PAGO)' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Opcional. Un reintento con la misma clave devuelve la misma cita en lugar de crear otra (ADR 0008/0012).',
  })
  @ApiResponse({ status: 201, description: 'Cita creada (o la misma cita, si es un reintento)' })
  @ApiResponse({
    status: 409,
    description: 'Franja ocupada, tope de reservas pendientes o clave ya usada por otra operación',
  })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.bookingsService.create(userId, dto, { idempotencyKey });
  }

  @Post('admin')
  @Roles(Role.ADMIN, Role.EMPLEADO)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear cita para un cliente (Admin/Empleado)' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Opcional. Mismo comportamiento que en POST /bookings.',
  })
  @ApiResponse({ status: 201, description: 'Cita creada' })
  createForUser(
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!dto.userId) throw new Error('userId es requerido para crear citas a nombre de un cliente');
    // El cupo de reservas pendientes protege del abuso por el canal
    // conversacional; la creación administrativa es intencional y no lo consume.
    return this.bookingsService.create(dto.userId, dto, {
      enforcePendingCap: false,
      idempotencyKey,
    });
  }

  @Patch(':id/confirm')
  @Roles(Role.ADMIN, Role.EMPLEADO)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirmar cita (Admin/Empleado)' })
  confirm(@Param('id') id: string) {
    return this.bookingsService.confirm(id);
  }

  @Post('admin/sync-calendar')
  @Roles(Role.ADMIN, Role.EMPLEADO)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reintentar sincronización de Google Calendar pendiente (Admin/Empleado)' })
  syncCalendar() {
    return this.bookingsService.syncPendingCalendar();
  }

  @Patch(':id/cancel')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancelar cita — dueño o admin' })
  cancel(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.bookingsService.cancel(id, userId, role === 'ADMIN');
  }

  @Patch(':id/complete')
  @Roles(Role.ADMIN, Role.EMPLEADO)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Marcar cita como completada' })
  complete(@Param('id') id: string) {
    return this.bookingsService.complete(id);
  }

  @Patch(':id/reopen')
  @Roles(Role.ADMIN, Role.EMPLEADO)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revertir cita completada/no asistida a CONFIRMADA (Admin/Empleado)' })
  reopen(@Param('id') id: string) {
    return this.bookingsService.reopen(id);
  }

  @Patch(':id/reschedule')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reagendar cita — dueño o admin' })
  reschedule(
    @Param('id') id: string,
    @Body('startTime') startTime: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.bookingsService.reschedule(id, startTime, userId, role === 'ADMIN');
  }
}
