import { Coupon, CouponUsage } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result';

export interface ICouponSafe {
  id: string; code: string; discount: number;
  isActive: boolean; maxUses: number | null; usedCount: number; perUserLimit: number;
  expiresAt: Date; userId: string | null; createdAt: Date;
  user?: { firstName: string; lastName: string; email: string };
}

export interface CouponFilters { page?: number; limit?: number; }

export abstract class ICouponsRepository {
  abstract findAll(filters?: CouponFilters): Promise<PaginatedResult<ICouponSafe>>;
  abstract findById(id: string): Promise<ICouponSafe>;
  abstract findByCode(code: string): Promise<Coupon | null>;
  abstract findUsage(couponId: string, userId: string): Promise<CouponUsage | null>;
  abstract findUsages(couponId: string): Promise<(CouponUsage & { user: { firstName: string; lastName: string; email: string } })[]>;
  abstract consumeCoupon(couponId: string, userId: string, orderId?: string): Promise<CouponUsage>;
  abstract create(data: Prisma.CouponCreateInput): Promise<Coupon>;
  abstract update(id: string, data: Prisma.CouponUpdateInput): Promise<ICouponSafe>;
  abstract remove(id: string): Promise<void>;
}
