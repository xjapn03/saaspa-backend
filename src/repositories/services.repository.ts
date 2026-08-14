import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IServicesRepository, ServiceFilters } from './interfaces/services.repository';
import { paginated } from '../common/interfaces/paginated-result';

const serviceSelect = {
  id: true, name: true, slug: true, description: true, price: true, duration: true,
  isActive: true, categoryId: true, imageUrl: true, createdAt: true, updatedAt: true,
  categoryRel: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ServiceSelect;

const toSafe = (s: any) => ({ ...s, price: Number(s.price) });

@Injectable()
export class ServicesRepository extends IServicesRepository {
  constructor(private prisma: PrismaService) { super(); }

  async findAll(filters: ServiceFilters = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ServiceWhereInput = {};
    const [data, total] = await Promise.all([
      this.prisma.service.findMany({ where, select: serviceSelect, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.service.count({ where }),
    ]);
    return paginated(data.map(toSafe), total, page, limit);
  }

  async findActive(filters: ServiceFilters = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ServiceWhereInput = { isActive: true };
    const [data, total] = await Promise.all([
      this.prisma.service.findMany({ where, select: serviceSelect, orderBy: { name: 'asc' }, skip, take: limit }),
      this.prisma.service.count({ where }),
    ]);
    return paginated(data.map(toSafe), total, page, limit);
  }

  async findById(id: string) {
    const service = await this.prisma.service.findUnique({ where: { id }, select: serviceSelect });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    return toSafe(service);
  }

  async findBySlug(slug: string) {
    const service = await this.prisma.service.findUnique({ where: { slug }, select: serviceSelect });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    return toSafe(service);
  }

  async create(data: Prisma.ServiceCreateInput) { return this.prisma.service.create({ data }); }

  async update(id: string, data: Prisma.ServiceUpdateInput) {
    await this.findById(id);
    const updated = await this.prisma.service.update({ where: { id }, data, select: serviceSelect });
    return toSafe(updated);
  }

  async remove(id: string) {
    await this.findById(id);
    const removed = await this.prisma.service.update({ where: { id }, data: { isActive: false }, select: serviceSelect });
    return toSafe(removed);
  }
}
