import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ICouponsRepository, ICouponSafe } from './interfaces/coupons.repository';

const couponSelect = {
  id: true,
  code: true,
  discount: true,
  isUsed: true,
  expiresAt: true,
  userId: true,
  createdAt: true,
  user: { select: { firstName: true, lastName: true, email: true } },
} satisfies Prisma.CouponSelect;

@Injectable()
export class CouponsRepository extends ICouponsRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async findAll() {
    return this.prisma.coupon.findMany({
      select: couponSelect,
      orderBy: { createdAt: 'desc' },
    }) as unknown as ICouponSafe[];
  }

  async findById(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      select: couponSelect,
    });
    if (!coupon) throw new NotFoundException('Cupón no encontrado');
    return coupon as unknown as ICouponSafe;
  }

  async findByCode(code: string) {
    return this.prisma.coupon.findUnique({ where: { code } });
  }

  async create(data: Prisma.CouponCreateInput) {
    return this.prisma.coupon.create({ data });
  }

  async update(id: string, data: Prisma.CouponUpdateInput) {
    await this.findById(id);
    return this.prisma.coupon.update({
      where: { id },
      data,
      select: couponSelect,
    }) as unknown as ICouponSafe;
  }

  async remove(id: string) {
    await this.findById(id);
    await this.prisma.coupon.delete({ where: { id } });
  }
}
