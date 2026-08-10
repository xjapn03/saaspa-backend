import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { ICouponsRepository } from '../../repositories/interfaces/coupons.repository';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private couponsRepo: ICouponsRepository) {}

  async findAll() {
    return this.couponsRepo.findAll();
  }

  async findById(id: string) {
    return this.couponsRepo.findById(id);
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
      ...(dto.userId ? { user: { connect: { id: dto.userId } } } : {}),
    });
  }

  async markAsUsed(id: string) {
    const coupon = await this.couponsRepo.findById(id);
    if (coupon.isUsed) {
      throw new BadRequestException('El cupón ya fue usado');
    }
    return this.couponsRepo.update(id, { isUsed: true });
  }

  async remove(id: string) {
    return this.couponsRepo.remove(id);
  }

  async validate(dto: ValidateCouponDto) {
    const coupon = await this.couponsRepo.findByCode(dto.code.toUpperCase());
    if (!coupon) {
      throw new BadRequestException('Cupón no válido');
    }
    if (coupon.isUsed) {
      throw new BadRequestException('Este cupón ya fue usado');
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
}
