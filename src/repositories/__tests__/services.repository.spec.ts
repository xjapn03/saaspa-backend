import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../database/prisma.service';
import { ServicesRepository } from '../services.repository';

describe('ServicesRepository', () => {
  let repo: ServicesRepository;
  let prisma: DeepMockProxy<PrismaService>;

  const mockService = {
    id: 'svc-1', name: 'Facial', description: null,
    price: 180000, duration: 75, isActive: true,
    category: 'Facial', imageUrl: null, createdAt: new Date(), updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ServicesRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get<ServicesRepository>(ServicesRepository);
  });

  describe('findAll', () => {
    it('should return all services with converted prices', async () => {
      prisma.service.findMany.mockResolvedValue([mockService] as any);
      prisma.service.count.mockResolvedValue(1);
      const result = await repo.findAll();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].price).toBe(180000);
    });
  });

  describe('findActive', () => {
    it('should filter by isActive true', async () => {
      prisma.service.findMany.mockResolvedValue([mockService] as any);
      prisma.service.count.mockResolvedValue(1);
      await repo.findActive();
      expect(prisma.service.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException when missing', async () => {
      prisma.service.findUnique.mockResolvedValue(null);
      await expect(repo.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft-delete (set isActive = false)', async () => {
      prisma.service.findUnique.mockResolvedValue(mockService as any);
      prisma.service.update.mockResolvedValue({ ...mockService, isActive: false } as any);
      const result = await repo.remove('svc-1');
      expect(result.isActive).toBe(false);
    });
  });
});
