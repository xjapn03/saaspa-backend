import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { IProductsRepository, IProductSafe, ProductFilters } from './interfaces/products.repository';
import { paginated, PaginatedResult } from '../common/interfaces/paginated-result';

const productSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  price: true,
  compareAtPrice: true,
  stock: true,
  sku: true,
  mainImage: true,
  carouselImages: true,
  sponsor: true,
  isActive: true,
  isFeatured: true,
  categoryId: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductSelect;

const toSafe = (p: any): IProductSafe => ({
  ...p,
  price: Number(p.price),
  compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : null,
});

@Injectable()
export class ProductsRepository extends IProductsRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async findAll(filters: ProductFilters = {}): Promise<PaginatedResult<IProductSafe>> {
    const where: Prisma.ProductWhereInput = {};
    if (!filters.includeInactive) where.isActive = true;
    if (filters.featured) where.isFeatured = true;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { sponsor: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.categorySlug) where.category = { slug: filters.categorySlug };

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({ where, select: productSelect, orderBy: { createdAt: 'desc' }, take: limit, skip }),
      this.prisma.product.count({ where }),
    ]);
    return paginated(data.map(toSafe), total, page, limit);
  }

  async findBySlug(slug: string): Promise<IProductSafe> {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: productSelect,
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return toSafe(product);
  }

  async findById(id: string): Promise<IProductSafe> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: productSelect,
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return toSafe(product);
  }

  async create(data: Prisma.ProductCreateInput) {
    return this.prisma.product.create({ data });
  }

  async update(id: string, data: Prisma.ProductUpdateInput): Promise<IProductSafe> {
    await this.findById(id);
    const updated = await this.prisma.product.update({
      where: { id },
      data,
      select: productSelect,
    });
    return toSafe(updated);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
