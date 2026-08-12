import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../database/prisma.service';
import { CategoriesRepository } from '../categories.repository';

describe('CategoriesRepository', () => {
  let repo: CategoriesRepository;
  let prisma: DeepMockProxy<PrismaService>;

  const mockCategory = {
    id: 'cat-1', name: 'Cremas', slug: 'cremas', description: null,
    imageUrl: null, parentId: null, isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
    children: [],
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CategoriesRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get<CategoriesRepository>(CategoriesRepository);
  });

  describe('findAll', () => {
    it('should return only active by default', async () => {
      prisma.category.findMany.mockResolvedValue([mockCategory] as any);
      const result = await repo.findAll();
      expect(result.data).toHaveLength(1);
    });

    it('should include inactive when param is true', async () => {
      prisma.category.findMany.mockResolvedValue([]);
      prisma.category.count.mockResolvedValue(0);
      await repo.findAll({ includeInactive: true });
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('findTree', () => {
    it('should return root categories with children', async () => {
      prisma.category.findMany.mockResolvedValue([mockCategory] as any);
      const result = await repo.findTree();
      expect(result).toHaveLength(1);
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true, parentId: null } }),
      );
    });
  });

  describe('findBySlug', () => {
    it('should return null when not found', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      const result = await repo.findBySlug('ghost');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException when missing', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(repo.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
