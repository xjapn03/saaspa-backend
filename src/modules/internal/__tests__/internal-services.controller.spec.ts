import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { ServicesService } from '../../services/services.service';
import { InternalAuthGuard } from '../guards/internal-auth.guard';
import { InternalServicesController } from '../internal-services.controller';

describe('InternalServicesController', () => {
  let controller: InternalServicesController;
  let servicesService: DeepMockProxy<ServicesService>;

  const UUID = '3f1a1f6e-5b1c-4a5e-9a0e-1b2c3d4e5f60';
  const CATEGORY = { id: 'cat-1', name: 'Faciales', slug: 'faciales' };

  const mockService = {
    id: UUID,
    name: 'Facial Premium',
    slug: 'facial-premium',
    description: 'Test desc',
    price: 180000,
    compareAtPrice: null,
    duration: 75,
    isActive: true,
    isFeatured: false,
    categoryId: 'cat-1',
    categoryRel: CATEGORY,
    imageUrl: null,
    mainImage: null,
    carouselImages: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    servicesService = mockDeep<ServicesService>();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalServicesController],
      providers: [{ provide: ServicesService, useValue: servicesService }],
    })
      // The controller declares @UseGuards(InternalAuthGuard); the guard has its own
      // suite, so here it is replaced by a stub.
      .overrideGuard(InternalAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<InternalServicesController>(InternalServicesController);
  });

  describe('list', () => {
    it('delegates to findActive and maps categoryRel to category', async () => {
      servicesService.findActive.mockResolvedValue({
        data: [mockService],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const result = await controller.list({ page: 1, limit: 20, featured: 'true' });

      expect(servicesService.findActive).toHaveBeenCalledWith({ page: 1, limit: 20, featured: true });
      expect(result.total).toBe(1);
      expect(result.data[0].category).toEqual(CATEGORY);
      expect(result.data[0].price).toBe(180000);
      expect(result.data[0]).not.toHaveProperty('categoryRel');
      expect(result.data[0]).not.toHaveProperty('createdAt');
      expect(result.data[0]).not.toHaveProperty('updatedAt');
    });

    it('treats a missing featured filter as false and forwards undefined paging', async () => {
      servicesService.findActive.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      await controller.list({});

      expect(servicesService.findActive).toHaveBeenCalledWith({
        page: undefined,
        limit: undefined,
        featured: false,
      });
    });

    it('keeps category null when the service has no category', async () => {
      servicesService.findActive.mockResolvedValue({
        data: [{ ...mockService, categoryRel: null, categoryId: null }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const result = await controller.list({});

      expect(result.data[0].category).toBeNull();
      expect(result.data[0].categoryId).toBeNull();
    });
  });

  describe('detail', () => {
    it('resolves by id when the parameter is a UUID', async () => {
      servicesService.findById.mockResolvedValue(mockService as never);

      const result = await controller.detail(UUID);

      expect(servicesService.findById).toHaveBeenCalledWith(UUID);
      expect(servicesService.findBySlug).not.toHaveBeenCalled();
      expect(result.slug).toBe('facial-premium');
      expect(result.category).toEqual(CATEGORY);
    });

    it('resolves by slug otherwise', async () => {
      servicesService.findBySlug.mockResolvedValue(mockService as never);

      await controller.detail('facial-premium');

      expect(servicesService.findBySlug).toHaveBeenCalledWith('facial-premium');
      expect(servicesService.findById).not.toHaveBeenCalled();
    });

    it('propagates the 404 returned by the services layer', async () => {
      servicesService.findBySlug.mockRejectedValue(new NotFoundException('Servicio no encontrado'));

      await expect(controller.detail('no-existe')).rejects.toThrow(NotFoundException);
    });
  });
});
