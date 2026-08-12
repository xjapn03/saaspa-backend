import { Injectable } from '@nestjs/common';
import { IServicesRepository, ServiceFilters } from '../../repositories/interfaces/services.repository';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class ServicesService {
  constructor(private servicesRepo: IServicesRepository) {}

  async findAll(filters?: ServiceFilters) {
    return this.servicesRepo.findAll(filters);
  }

  async findActive(filters?: ServiceFilters) {
    return this.servicesRepo.findActive(filters);
  }

  async findById(id: string) {
    return this.servicesRepo.findById(id);
  }

  async findBySlug(slug: string) {
    return this.servicesRepo.findBySlug(slug);
  }

  async create(data: CreateServiceDto) {
    const normalized: any = { ...data };
    if (normalized.categoryId === '') normalized.categoryId = null;
    if (!normalized.slug) normalized.slug = slugify(normalized.name);
    return this.servicesRepo.create(normalized);
  }

  async update(id: string, data: UpdateServiceDto) {
    const normalized: any = { ...data };
    if (normalized.categoryId === '') normalized.categoryId = null;
    if (normalized.name && !normalized.slug) normalized.slug = slugify(normalized.name);
    return this.servicesRepo.update(id, normalized);
  }

  async remove(id: string) {
    return this.servicesRepo.remove(id);
  }
}
