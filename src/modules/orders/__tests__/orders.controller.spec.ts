import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { OrdersController } from '../orders.controller';
import { OrdersService } from '../orders.service';

describe('OrdersController', () => {
  let controller: OrdersController;
  let service: DeepMockProxy<OrdersService>;

  const mockOrder = {
    id: 'order-1',
    userId: 'user-1',
    total: 100000,
    status: 'CONFIRMADO',
    shippingName: 'María Gómez',
    shippingEmail: 'maria@test.com',
    shippingPhone: '3001234567',
    shippingAddress: 'Calle 1',
    shippingCity: 'Bogotá',
    shippingState: 'Cundinamarca',
    shippingNit: '123456789',
    shippingNotes: null,
    paymentId: 'pay-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    service = mockDeep<OrdersService>();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: service }],
    }).compile();
    controller = module.get<OrdersController>(OrdersController);
  });

  describe('findAll', () => {
    it('should list orders with filters for admin', async () => {
      service.findAll.mockResolvedValue({ data: [mockOrder], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await controller.findAll('maria', 'CONFIRMADO', '2026-08-01', '2026-08-31');
      expect(result.data).toHaveLength(1);
      expect(service.findAll).toHaveBeenCalledWith(expect.objectContaining({ search: 'maria', status: 'CONFIRMADO' }));
    });
  });

  describe('findMyOrders', () => {
    it('should list current user orders', async () => {
      service.findByUser.mockResolvedValue({ data: [mockOrder], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await controller.findMyOrders('user-1');
      expect(result.data).toHaveLength(1);
      expect(service.findByUser).toHaveBeenCalledWith('user-1', { page: undefined, limit: undefined });
    });
  });

  describe('findById', () => {
    it('should return order by id', async () => {
      service.findById.mockResolvedValue(mockOrder);
      const result = await controller.findById('order-1');
      expect(result.id).toBe('order-1');
    });
  });

  describe('updateStatus', () => {
    it('should update order status', async () => {
      service.updateStatus.mockResolvedValue({ ...mockOrder, status: 'ENVIADO' });
      const result = await controller.updateStatus('order-1', 'ENVIADO');
      expect(result.status).toBe('ENVIADO');
      expect(service.updateStatus).toHaveBeenCalledWith('order-1', 'ENVIADO');
    });
  });
});
