import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { ICouponsRepository, CouponFilters } from '../../repositories/interfaces/coupons.repository';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private couponsRepo: ICouponsRepository) {}

  async findAll(filters?: CouponFilters) {
    return this.couponsRepo.findAll(filters);
  }

  async findById(id: string) {
    return this.couponsRepo.findById(id);
  }

  async findUsages(id: string) {
    return this.couponsRepo.findUsages(id);
  }

  async create(dto: CreateCouponDto) {
    const existing = await this.couponsRepo.findByCode(dto.code);
    if (existing) {
      throw new ConflictException('El código de cupón ya existe');
    }

    return this.couponsRepo.create({
      code: dto.code.toUpperCase(),
      discount: dto.discount,
      expiresAt: new Date(dto.expiresAt),
      maxUses: dto.maxUses ?? null,
      perUserLimit: dto.perUserLimit ?? 1,
      ...(dto.userId ? { user: { connect: { id: dto.userId } } } : {}),
    });
  }

  async remove(id: string) {
    return this.couponsRepo.remove(id);
  }

  async validate(dto: ValidateCouponDto) {
    const coupon = await this.couponsRepo.findByCode(dto.code.toUpperCase());
    if (!coupon) {
      throw new BadRequestException('Cupón no válido');
    }
    if (!coupon.isActive) {
      throw new BadRequestException('Este cupón ya no está activo');
    }
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('Este cupón alcanzó su límite de usos');
    }
    if (new Date(coupon.expiresAt) < new Date()) {
      throw new BadRequestException('Este cupón expiró');
    }
    return {
      id: coupon.id,
      code: coupon.code,
      discount: Number(coupon.discount),
      valid: true,
    };
  }

  async canUserUse(couponId: string, userId: string): Promise<boolean> {
    const usage = await this.couponsRepo.findUsage(couponId, userId);
    return !usage;
  }
}
