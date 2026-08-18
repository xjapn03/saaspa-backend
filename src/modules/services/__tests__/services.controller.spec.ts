import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { ServicesController } from '../services.controller';
import { ServicesService } from '../services.service';

describe('ServicesController', () => {
  let controller: ServicesController;
  let service: DeepMockProxy<ServicesService>;

  const mockService = {
    id: 'svc-1',
    name: 'Facial Premium',
    slug: 'facial-premium',
    description: 'Test desc',
    price: 180000,
    duration: 75,
    isActive: true,
    categoryId: null,
    imageUrl: null, compareAtPrice: null, isFeatured: false, mainImage: null, carouselImages: null, 
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    service = mockDeep<ServicesService>();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ServicesController],
      providers: [{ provide: ServicesService, useValue: service }],
    }).compile();
    controller = module.get<ServicesController>(ServicesController);
  });

  describe('findAll', () => {
    it('should return all services', async () => {
      service.findAll.mockResolvedValue({ data: [mockService], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await controller.findAll();
      expect(result.data).toHaveLength(1);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findActive', () => {
    it('should return active services for public', async () => {
      service.findActive.mockResolvedValue({ data: [mockService], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await controller.findActive();
      expect(result.data).toHaveLength(1);
      expect(service.findActive).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return service by id', async () => {
      service.findById.mockResolvedValue(mockService);
      const result = await controller.findById('svc-1');
      expect(result.name).toBe('Facial Premium');
      expect(service.findById).toHaveBeenCalledWith('svc-1');
    });
  });

  describe('create', () => {
    it('should create a new service', async () => {
      const dto = { name: 'New', price: 50000, duration: 30 };
      service.create.mockResolvedValue({ ...mockService, ...dto } as any);
      const result = await controller.create(dto);
      expect(result.name).toBe('New');
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('should update a service', async () => {
      const dto = { name: 'Updated' };
      service.update.mockResolvedValue({ ...mockService, ...dto });
      const result = await controller.update('svc-1', dto);
      expect(result.name).toBe('Updated');
      expect(service.update).toHaveBeenCalledWith('svc-1', dto);
    });
  });

  describe('remove', () => {
    it('should soft-delete a service', async () => {
      await controller.remove('svc-1');
      expect(service.remove).toHaveBeenCalledWith('svc-1');
    });
  });
});
