import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IServicesRepository } from './interfaces/services.repository';

const serviceSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  duration: true,
  isActive: true,
  category: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ServiceSelect;

@Injectable()
export class ServicesRepository extends IServicesRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async findAll() {
    const services = await this.prisma.service.findMany({
      select: serviceSelect,
      orderBy: { createdAt: 'desc' },
    });
    return services.map((s) => ({ ...s, price: Number(s.price) }));
  }

  async findActive() {
    const services = await this.prisma.service.findMany({
      where: { isActive: true },
      select: serviceSelect,
      orderBy: { category: 'asc' },
    });
    return services.map((s) => ({ ...s, price: Number(s.price) }));
  }

  async findById(id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
      select: serviceSelect,
    });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    return { ...service, price: Number(service.price) };
  }

  async create(data: Prisma.ServiceCreateInput) {
    return this.prisma.service.create({ data });
  }

  async update(id: string, data: Prisma.ServiceUpdateInput) {
    await this.findById(id);
    const updated = await this.prisma.service.update({
      where: { id },
      data,
      select: serviceSelect,
    });
    return { ...updated, price: Number(updated.price) };
  }

  async remove(id: string) {
    await this.findById(id);
    const removed = await this.prisma.service.update({
      where: { id },
      data: { isActive: false },
      select: serviceSelect,
    });
    return { ...removed, price: Number(removed.price) };
  }
}
