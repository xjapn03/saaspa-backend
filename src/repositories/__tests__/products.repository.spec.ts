import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../database/prisma.service';
import { ProductsRepository } from '../products.repository';

describe('ProductsRepository', () => {
  let repo: ProductsRepository;
  let prisma: DeepMockProxy<PrismaService>;

  const mockRow = {
    id: 'prod-1', name: 'Test', slug: 'test', description: null,
    price: { toNumber: () => 85000 }, compareAtPrice: null, stock: 10,
    sku: null, mainImage: null, carouselImages: null, sponsor: null,
    isActive: true, isFeatured: false, categoryId: 'cat-1',
    createdAt: new Date(), updatedAt: new Date(),
    category: { id: 'cat-1', name: 'Cremas', slug: 'cremas' },
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get<ProductsRepository>(ProductsRepository);
  });

  describe('findAll', () => {
    it('should filter by isActive by default', async () => {
      prisma.product.findMany.mockResolvedValue([mockRow] as any);
      await repo.findAll();
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }),
      );
    });

    it('should include inactive when includeInactive is true', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await repo.findAll({ includeInactive: true });
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.not.objectContaining({ isActive: expect.anything() }) }),
      );
    });

    it('should filter by categorySlug', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await repo.findAll({ categorySlug: 'cremas' });
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ category: { slug: 'cremas' } }) }),
      );
    });

    it('should paginate with default limit 20', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await repo.findAll({ page: 2 });
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20, skip: 20 }),
      );
    });
  });

  describe('findBySlug', () => {
    it('should throw NotFoundException when missing', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(repo.findBySlug('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft-delete (set isActive = false)', async () => {
      prisma.product.findUnique.mockResolvedValue(mockRow);
      prisma.product.update.mockResolvedValue({ ...mockRow, isActive: false } as any);
      await repo.remove('prod-1');
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      );
    });
  });
});
