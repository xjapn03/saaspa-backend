import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ICategoriesRepository, ICategorySafe, CategoryFilters } from './interfaces/categories.repository';
import { paginated, PaginatedResult } from '../common/interfaces/paginated-result';

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  imageUrl: true,
  parentId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  children: {
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      parentId: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.CategorySelect;

type CategoryWithChildren = Prisma.CategoryGetPayload<{ select: typeof categorySelect }>;

const flatSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  imageUrl: true,
  parentId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CategorySelect;

@Injectable()
export class CategoriesRepository extends ICategoriesRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  async findAll(filters: CategoryFilters = {}): Promise<PaginatedResult<ICategorySafe>> {
    const where = filters.includeInactive ? {} : { isActive: true };
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.category.findMany({ where, select: flatSelect, orderBy: { name: 'asc' }, skip, take: limit }),
      this.prisma.category.count({ where }),
    ]);
    return paginated(data as ICategorySafe[], total, page, limit);
  }

  async findTree(): Promise<ICategorySafe[]> {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true, parentId: null },
      select: categorySelect,
      orderBy: { name: 'asc' },
    });
    return categories.map((c) => ({
      ...c,
      children: (c as any).children || [],
    })) as ICategorySafe[];
  }

  async findById(id: string): Promise<ICategorySafe> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: categorySelect,
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category as ICategorySafe;
  }

  async findBySlug(slug: string): Promise<ICategorySafe | null> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      select: categorySelect,
    });
    return category as ICategorySafe | null;
  }

  async create(data: Prisma.CategoryCreateInput) {
    return this.prisma.category.create({ data });
  }

  async update(id: string, data: Prisma.CategoryUpdateInput): Promise<ICategorySafe> {
    await this.findById(id);
    const updated = await this.prisma.category.update({
      where: { id },
      data,
      select: flatSelect,
    });
    return updated as ICategorySafe;
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
