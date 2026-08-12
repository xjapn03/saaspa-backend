import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { ServicesService } from '../services.service';
import { IServicesRepository } from '../../../repositories/interfaces/services.repository';

describe('ServicesService', () => {
  let service: ServicesService;
  let repo: DeepMockProxy<IServicesRepository>;

  const mockService = {
    id: 'svc-1',
    name: 'Facial Premium',
    description: 'Test desc',
    price: 180000,
    duration: 75,
    isActive: true,
    categoryId: null,
    imageUrl: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    repo = mockDeep<IServicesRepository>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: IServicesRepository, useValue: repo },
      ],
    }).compile();
    service = module.get<ServicesService>(ServicesService);
  });

  describe('findAll', () => {
    it('should delegate to repository and return all services', async () => {
      repo.findAll.mockResolvedValue({ data: [mockService], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await service.findAll();
      expect(result.data).toHaveLength(1);
      expect(repo.findAll).toHaveBeenCalled();
    });
  });

  describe('findActive', () => {
    it('should return only active services', async () => {
      repo.findActive.mockResolvedValue({ data: [mockService], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await service.findActive();
      expect(result.data).toHaveLength(1);
      expect(repo.findActive).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return a service by id', async () => {
      repo.findById.mockResolvedValue(mockService);
      const result = await service.findById('svc-1');
      expect(result.name).toBe('Facial Premium');
      expect(repo.findById).toHaveBeenCalledWith('svc-1');
    });
  });

  describe('create', () => {
    it('should create and return a new service', async () => {
      const data = { name: 'New', price: 50000, duration: 30 };
      repo.create.mockResolvedValue({ ...mockService, ...data } as any);
      const result = await service.create(data);
      expect(result.name).toBe('New');
      expect(repo.create).toHaveBeenCalledWith(data);
    });
  });

  describe('update', () => {
    it('should update and return the service', async () => {
      const data = { name: 'Updated' };
      repo.update.mockResolvedValue({ ...mockService, ...data });
      const result = await service.update('svc-1', data);
      expect(result.name).toBe('Updated');
      expect(repo.update).toHaveBeenCalledWith('svc-1', data);
    });

    it('should normalize empty categoryId to null', async () => {
      const data = { name: 'Updated', categoryId: '' };
      repo.update.mockResolvedValue({ ...mockService, ...data } as any);
      await service.update('svc-1', data as any);
      expect(repo.update).toHaveBeenCalledWith('svc-1', { name: 'Updated', categoryId: null });
    });
  });

  describe('remove', () => {
    it('should soft-delete the service', async () => {
      repo.remove.mockResolvedValue({ ...mockService, isActive: false });
      const result = await service.remove('svc-1');
      expect(result.isActive).toBe(false);
      expect(repo.remove).toHaveBeenCalledWith('svc-1');
    });
  });
});
