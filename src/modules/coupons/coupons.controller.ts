import {
  Controller, Get, Post, Delete, Param, Body, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private couponsService: CouponsService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar todos los cupones (Admin)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.couponsService.findAll({ page: page ? parseInt(page) : undefined, limit: limit ? parseInt(limit) : undefined });
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener cupón por ID (Admin)' })
  findById(@Param('id') id: string) {
    return this.couponsService.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear nuevo cupón (Admin)' })
  @ApiResponse({ status: 201, description: 'Cupón creado' })
  create(@Body() dto: CreateCouponDto) {
    return this.couponsService.create(dto);
  }

  @Get(':id/usages')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar usos de un cupón (Admin)' })
  findUsages(@Param('id') id: string) {
    return this.couponsService.findUsages(id);
  }

  @Post('validate')
  @Public()
  @ApiOperation({ summary: 'Validar código de cupón (público)' })
  @ApiResponse({ status: 200, description: 'Cupón válido' })
  @ApiResponse({ status: 400, description: 'Cupón inválido, agotado o expirado' })
  validate(@Body() dto: ValidateCouponDto) {
    return this.couponsService.validate(dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar cupón (Admin)' })
  @ApiResponse({ status: 204, description: 'Cupón eliminado' })
  async remove(@Param('id') id: string) {
    await this.couponsService.remove(id);
  }
}
