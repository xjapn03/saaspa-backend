import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role, BannerPosition } from '@prisma/client';
import { BannersService } from './banners.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Banners')
@Controller('banners')
export class BannersController {
  constructor(private bannersService: BannersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.EMPLEADO)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar todos los banners (Admin)' })
  findAll() {
    return this.bannersService.findAll();
  }

  @Get('public')
  @Public()
  @ApiOperation({ summary: 'Listar banners activos (público)' })
  @ApiQuery({ name: 'position', required: false, enum: BannerPosition })
  findPublic(@Query('position') position?: BannerPosition) {
    return this.bannersService.findPublic(position);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Crear banner (Admin)' })
  @ApiResponse({ status: 201, description: 'Banner creado' })
  create(@Body() dto: CreateBannerDto) {
    return this.bannersService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Actualizar banner (Admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return this.bannersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Eliminar banner (Admin)' })
  async remove(@Param('id') id: string) {
    await this.bannersService.remove(id);
  }
}
