import { Coupon } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result';

export interface ICouponSafe {
  id: string; code: string; discount: number; isUsed: boolean;
  expiresAt: Date; userId: string | null; createdAt: Date;
  user?: { firstName: string; lastName: string; email: string };
}

export interface CouponFilters { page?: number; limit?: number; }

export abstract class ICouponsRepository {
  abstract findAll(filters?: CouponFilters): Promise<PaginatedResult<ICouponSafe>>;
  abstract findById(id: string): Promise<ICouponSafe>;
  abstract findByCode(code: string): Promise<Coupon | null>;
  abstract create(data: Prisma.CouponCreateInput): Promise<Coupon>;
  abstract update(id: string, data: Prisma.CouponUpdateInput): Promise<ICouponSafe>;
  abstract remove(id: string): Promise<void>;
}
