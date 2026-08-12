import { Injectable } from '@nestjs/common';
import { IServicesRepository, ServiceFilters } from '../../repositories/interfaces/services.repository';

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

  async create(data: Parameters<IServicesRepository['create']>[0]) {
    return this.servicesRepo.create(data);
  }

  async update(id: string, data: Parameters<IServicesRepository['update']>[1]) {
    return this.servicesRepo.update(id, data);
  }

  async remove(id: string) {
    return this.servicesRepo.remove(id);
  }
}
