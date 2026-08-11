import { Injectable } from '@nestjs/common';
import { IProductsRepository } from '../../repositories/interfaces/products.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private productsRepo: IProductsRepository) {}

  async findAll(filters: {
    categorySlug?: string;
    categoryId?: string;
    featured?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    return this.productsRepo.findAll(filters);
  }

  async findAdminAll() {
    return this.productsRepo.findAll({ includeInactive: true });
  }

  async findBySlug(slug: string) {
    return this.productsRepo.findBySlug(slug);
  }

  async findById(id: string) {
    return this.productsRepo.findById(id);
  }

  async create(dto: CreateProductDto) {
    const data: any = { ...dto };
    if (dto.categoryId) {
      data.category = { connect: { id: dto.categoryId } };
      delete data.categoryId;
    }
    return this.productsRepo.create(data);
  }

  async update(id: string, dto: UpdateProductDto) {
    const data: any = { ...dto };
    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId ? { connect: { id: dto.categoryId } } : { disconnect: true };
      delete data.categoryId;
    }
    return this.productsRepo.update(id, data);
  }

  async remove(id: string) {
    return this.productsRepo.remove(id);
  }
}
