import { Product } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result';

export interface IProductSafe {
  id: string; name: string; slug: string; description: string | null;
  price: number; compareAtPrice: number | null; stock: number; sku: string | null;
  mainImage: string | null; carouselImages: unknown; sponsor: string | null;
  isActive: boolean; isFeatured: boolean; categoryId: string | null;
  createdAt: Date; updatedAt: Date;
  category?: { id: string; name: string; slug: string } | null;
}

export interface ProductFilters {
  categorySlug?: string; categoryId?: string; featured?: boolean;
  search?: string; page?: number; limit?: number; includeInactive?: boolean;
}

export abstract class IProductsRepository {
  abstract findAll(filters?: ProductFilters): Promise<PaginatedResult<IProductSafe>>;
  abstract findBySlug(slug: string): Promise<IProductSafe>;
  abstract findById(id: string): Promise<IProductSafe>;
  abstract create(data: Prisma.ProductCreateInput): Promise<Product>;
  abstract update(id: string, data: Prisma.ProductUpdateInput): Promise<IProductSafe>;
  abstract remove(id: string): Promise<void>;
}
