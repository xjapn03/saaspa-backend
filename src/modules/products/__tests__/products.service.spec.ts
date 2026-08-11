import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { ProductsService } from '../products.service';
import { IProductsRepository } from '../../../repositories/interfaces/products.repository';

describe('ProductsService', () => {
  let service: ProductsService;
  let repo: DeepMockProxy<IProductsRepository>;

  const mockProduct = {
    id: 'prod-1',
    name: 'Crema Hidratante',
    slug: 'crema-hidratante',
    price: 85000,
    isActive: true,
    isFeatured: true,
    categoryId: 'cat-1',
  };

  beforeEach(async () => {
    repo = mockDeep<IProductsRepository>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsService, { provide: IProductsRepository, useValue: repo }],
    }).compile();
    service = module.get<ProductsService>(ProductsService);
  });

  describe('findAll', () => {
    it('should delegate to repository with filters', async () => {
      repo.findAll.mockResolvedValue([mockProduct as any]);
      const result = await service.findAll({ categorySlug: 'cremas', featured: true, search: 'crema', page: 1, limit: 10 });
      expect(result).toHaveLength(1);
      expect(repo.findAll).toHaveBeenCalledWith({ categorySlug: 'cremas', featured: true, search: 'crema', page: 1, limit: 10 });
    });
  });

  describe('findBySlug', () => {
    it('should delegate to repository', async () => {
      repo.findBySlug.mockResolvedValue(mockProduct as any);
      const result = await service.findBySlug('crema-hidratante');
      expect(result.id).toBe('prod-1');
      expect(repo.findBySlug).toHaveBeenCalledWith('crema-hidratante');
    });
  });

  describe('create', () => {
    it('should connect category and create product', async () => {
      repo.create.mockResolvedValue(mockProduct as any);
      const dto = { name: 'Test', slug: 'test', price: 100, stock: 5, categoryId: 'cat-1' };
      const result = await service.create(dto as any);
      expect(result.id).toBe('prod-1');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ category: { connect: { id: 'cat-1' } } }),
      );
    });
  });

  describe('update', () => {
    it('should connect new category when categoryId provided', async () => {
      repo.update.mockResolvedValue(mockProduct as any);
      await service.update('prod-1', { categoryId: 'cat-2' } as any);
      expect(repo.update).toHaveBeenCalledWith('prod-1',
        expect.objectContaining({ category: { connect: { id: 'cat-2' } } }),
      );
    });

    it('should disconnect category when categoryId is null', async () => {
      repo.update.mockResolvedValue(mockProduct as any);
      await service.update('prod-1', { categoryId: null as any } as any);
      expect(repo.update).toHaveBeenCalledWith('prod-1',
        expect.objectContaining({ category: { disconnect: true } }),
      );
    });
  });
});
