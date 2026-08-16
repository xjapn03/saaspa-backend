import { Service } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result';

export interface IServiceSafe {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  duration: number;
  isActive: boolean;
  isFeatured: boolean;
  categoryId: string | null;
  categoryRel?: { id: string; name: string; slug: string } | null;
  imageUrl: string | null;
  mainImage: string | null;
  carouselImages: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceFilters {
  page?: number;
  limit?: number;
  featured?: boolean;
}

export abstract class IServicesRepository {
  abstract findAll(filters?: ServiceFilters): Promise<PaginatedResult<IServiceSafe>>;
  abstract findActive(filters?: ServiceFilters): Promise<PaginatedResult<IServiceSafe>>;
  abstract findById(id: string): Promise<IServiceSafe>;
  abstract findBySlug(slug: string): Promise<IServiceSafe>;
  abstract create(data: Prisma.ServiceCreateInput): Promise<Service>;
  abstract update(id: string, data: Prisma.ServiceUpdateInput): Promise<IServiceSafe>;
  abstract remove(id: string): Promise<IServiceSafe>;
}
