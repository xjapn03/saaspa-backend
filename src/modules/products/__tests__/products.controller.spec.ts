import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { ProductsController } from '../products.controller';
import { ProductsService } from '../products.service';

describe('ProductsController', () => {
  let controller: ProductsController;
  let productsService: DeepMockProxy<ProductsService>;

  beforeEach(async () => {
    productsService = mockDeep<ProductsService>();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: productsService }],
    }).compile();
    controller = module.get<ProductsController>(ProductsController);
  });

  describe('findAll', () => {
    it('should delegate to service with parsed filters', async () => {
      productsService.findAll.mockResolvedValue([]);
      await controller.findAll('cremas', undefined, 'true', 'search', '1', '10');
      expect(productsService.findAll).toHaveBeenCalledWith({
        categorySlug: 'cremas', categoryId: undefined, featured: true,
        search: 'search', page: 1, limit: 10,
      });
    });

    it('should pass undefined page/limit when not provided', async () => {
      productsService.findAll.mockResolvedValue([]);
      await controller.findAll();
      expect(productsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ page: undefined, limit: undefined }),
      );
    });
  });

  describe('findBySlug', () => {
    it('should delegate to service', async () => {
      productsService.findBySlug.mockResolvedValue({ id: 'prod-1' } as any);
      const result = await controller.findBySlug('test-slug');
      expect(result.id).toBe('prod-1');
    });
  });

  describe('create', () => {
    it('should delegate to service', async () => {
      productsService.create.mockResolvedValue({ id: 'prod-1' } as any);
      const dto = { name: 'Test', slug: 'test', price: 100 } as any;
      const result = await controller.create(dto);
      expect(result.id).toBe('prod-1');
      expect(productsService.create).toHaveBeenCalledWith(dto);
    });
  });
});
