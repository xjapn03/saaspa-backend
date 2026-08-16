import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, BannerPosition } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';

@Injectable()
export class BannersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const banners = await this.prisma.banner.findMany({ orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] });
    return banners.map((b) => ({ ...b, position: b.position }));
  }

  async findPublic(position?: BannerPosition) {
    const where: Prisma.BannerWhereInput = {
      isActive: true,
      ...(position ? { position } : {}),
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
      ],
    };
    const banners = await this.prisma.banner.findMany({ where, orderBy: { sortOrder: 'asc' } });
    return banners.map((b) => ({ ...b, position: b.position }));
  }

  async findById(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Banner no encontrado');
    return banner;
  }

  async create(dto: CreateBannerDto) {
    const data: Prisma.BannerCreateInput = { ...dto } as Prisma.BannerCreateInput;
    if (dto.startsAt) data.startsAt = new Date(dto.startsAt);
    if (dto.endsAt) data.endsAt = new Date(dto.endsAt);
    return this.prisma.banner.create({ data });
  }

  async update(id: string, dto: UpdateBannerDto) {
    await this.findById(id);
    const data: Prisma.BannerUpdateInput = { ...dto } as Prisma.BannerUpdateInput;
    if (dto.startsAt !== undefined) data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined) data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    return this.prisma.banner.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findById(id);
    await this.prisma.banner.delete({ where: { id } });
  }
}
