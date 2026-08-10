import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Services')
@Controller('services')
export class ServicesController {
  constructor(private servicesService: ServicesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.EMPLEADO)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar todos los servicios (Admin/Empleado)' })
  findAll() {
    return this.servicesService.findAll();
  }

  @Get('public')
  @Public()
  @ApiOperation({ summary: 'Listar servicios activos (público)' })
  findActive() {
    return this.servicesService.findActive();
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.EMPLEADO)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener servicio por ID' })
  findById(@Param('id') id: string) {
    return this.servicesService.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear nuevo servicio (Admin)' })
  @ApiResponse({ status: 201, description: 'Servicio creado' })
  create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar servicio (Admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desactivar servicio — soft delete (Admin)' })
  async remove(@Param('id') id: string) {
    await this.servicesService.remove(id);
  }
}
