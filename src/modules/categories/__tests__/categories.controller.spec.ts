import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { CategoriesController } from '../categories.controller';
import { CategoriesService } from '../categories.service';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let service: DeepMockProxy<CategoriesService>;

  beforeEach(async () => {
    service = mockDeep<CategoriesService>();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: service }],
    }).compile();
    controller = module.get<CategoriesController>(CategoriesController);
  });

  describe('findAll', () => {
    it('should return all categories', async () => {
      service.findAll.mockResolvedValue([{ id: '1', name: 'Masajes', slug: 'masajes' } as any]);
      const result = await controller.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('findTree', () => {
    it('should return tree', async () => {
      service.findTree.mockResolvedValue([]);
      const result = await controller.findTree();
      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create category', async () => {
      service.create.mockResolvedValue({ id: '1', name: 'Faciales', slug: 'faciales' } as any);
      const result = await controller.create({ name: 'Faciales', slug: 'faciales' });
      expect(result.name).toBe('Faciales');
    });
  });
});
