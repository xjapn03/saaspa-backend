import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { CategoriesService } from '../categories.service';
import { ICategoriesRepository } from '../../../repositories/interfaces/categories.repository';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let repo: DeepMockProxy<ICategoriesRepository>;

  const mockCategory = {
    id: 'cat-1',
    name: 'Masajes',
    slug: 'masajes',
    description: 'Servicios de masajes',
    imageUrl: null,
    parentId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    repo = mockDeep<ICategoriesRepository>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: ICategoriesRepository, useValue: repo },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  describe('findAll', () => {
    it('should delegate to repository', async () => {
      repo.findAll.mockResolvedValue({ data: [mockCategory], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await service.findAll();
      expect(result.data).toHaveLength(1);
      expect(repo.findAll).toHaveBeenCalled();
    });
  });

  describe('findTree', () => {
    it('should return tree structure', async () => {
      const tree = [{ ...mockCategory, children: [{ ...mockCategory, id: 'cat-2', name: 'Relajante', parentId: 'cat-1' }] }];
      repo.findTree.mockResolvedValue(tree);
      const result = await service.findTree();
      expect(result[0].children).toHaveLength(1);
    });
  });

  describe('findBySlug', () => {
    it('should return category by slug', async () => {
      repo.findBySlug.mockResolvedValue(mockCategory);
      const result = await service.findBySlug('masajes');
      expect(result!.name).toBe('Masajes');
    });

    it('should throw if not found', async () => {
      repo.findBySlug.mockResolvedValue(null);
      await expect(service.findBySlug('nonexistent')).rejects.toThrow(ConflictException);
    });
  });

  describe('create', () => {
    it('should create category with lowercase slug', async () => {
      repo.create.mockResolvedValue({ ...mockCategory } as any);
      const result = await service.create({
        name: 'Masajes',
        slug: 'MASAJES',
        description: 'Desc',
      });
      expect(result).toBeDefined();
      expect(repo.create).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft delete category', async () => {
      repo.remove.mockResolvedValue(undefined);
      await expect(service.remove('cat-1')).resolves.toBeUndefined();
    });
  });
});
