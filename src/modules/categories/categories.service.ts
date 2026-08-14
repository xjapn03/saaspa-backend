import { Injectable, ConflictException } from '@nestjs/common';
import { ICategoriesRepository, CategoryFilters } from '../../repositories/interfaces/categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private categoriesRepo: ICategoriesRepository) {}

  async findAll(filters?: CategoryFilters) {
    return this.categoriesRepo.findAll(filters);
  }

  async findTree() {
    return this.categoriesRepo.findTree();
  }

  async findBySlug(slug: string) {
    const category = await this.categoriesRepo.findBySlug(slug);
    if (!category) throw new ConflictException('Categoría no encontrada');
    return category;
  }

  async findById(id: string) {
    return this.categoriesRepo.findById(id);
  }

  async create(dto: CreateCategoryDto) {
    return this.categoriesRepo.create({
      name: dto.name,
      slug: dto.slug.toLowerCase(),
      description: dto.description || null,
      imageUrl: dto.imageUrl || null,
      isActive: dto.isActive ?? true,
      ...(dto.parentId ? { parent: { connect: { id: dto.parentId } } } : {}),
    } as any);
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug.toLowerCase();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.parentId !== undefined) {
      data.parent = dto.parentId ? { connect: { id: dto.parentId } } : { disconnect: true };
    }
    return this.categoriesRepo.update(id, data);
  }

  async remove(id: string) {
    return this.categoriesRepo.remove(id);
  }
}
