import { Controller, Get, Post, Patch, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Listar todos los usuarios (Admin)' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios activos' })
  @ApiQuery({ name: 'role', required: false, enum: Role })
  @ApiQuery({ name: 'sortBy', required: false })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  findAll(@Query('role') role?: string, @Query('sortBy') sortBy?: string, @Query('order') order?: string) {
    return this.usersService.findAll({ role, sortBy, order: order as 'asc' | 'desc' });
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear usuario (Admin) — para clientes, empleados o admins' })
  @ApiResponse({ status: 201, description: 'Usuario creado' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Obtener perfil propio' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario autenticado' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Editar perfil propio' })
  @ApiResponse({ status: 200, description: 'Perfil actualizado' })
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(userId, dto);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Obtener usuario por ID (Admin)' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Editar cualquier usuario (Admin)' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desactivar usuario — soft delete (Admin)' })
  @ApiResponse({ status: 204, description: 'Usuario desactivado' })
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
  }
}
