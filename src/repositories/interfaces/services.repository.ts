import { Service } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result';

export interface IServiceSafe {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration: number;
  isActive: boolean;
  categoryId: string | null;
  categoryRel?: { id: string; name: string; slug: string } | null;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceFilters {
  page?: number;
  limit?: number;
}

export abstract class IServicesRepository {
  abstract findAll(filters?: ServiceFilters): Promise<PaginatedResult<IServiceSafe>>;
  abstract findActive(filters?: ServiceFilters): Promise<PaginatedResult<IServiceSafe>>;
  abstract findById(id: string): Promise<IServiceSafe>;
  abstract create(data: Prisma.ServiceCreateInput): Promise<Service>;
  abstract update(id: string, data: Prisma.ServiceUpdateInput): Promise<IServiceSafe>;
  abstract remove(id: string): Promise<IServiceSafe>;
}
