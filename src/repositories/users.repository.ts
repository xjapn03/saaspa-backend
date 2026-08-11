import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IUsersRepository, UserFilters } from './interfaces/users.repository';

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  birthday: true,
  description: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersRepository extends IUsersRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async findAll(filters: UserFilters = {}) {
    const where: Prisma.UserWhereInput = { isActive: true };
    if (filters.role) where.role = filters.role as any;
    const orderBy: Prisma.UserOrderByWithRelationInput = {};
    const sortBy = filters.sortBy || 'firstName';
    const order = filters.order || 'asc';
    if (sortBy === 'firstName') orderBy.firstName = order;
    else if (sortBy === 'createdAt') orderBy.createdAt = order;
    else orderBy.firstName = 'asc';

    return this.prisma.user.findMany({
      where,
      select: userSelect,
      orderBy,
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByIdWithCredentials(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput) {
    await this.findById(id);
    return this.prisma.user.update({
      where: { id },
      data,
      select: userSelect,
    });
  }

  async remove(id: string) {
    await this.findById(id);
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: userSelect,
    });
  }

  async setRefreshToken(userId: string, refreshToken: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken },
    });
  }
}
