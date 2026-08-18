import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { OrdersService } from '../orders.service';
import { IOrdersRepository } from '../../../repositories/interfaces/orders.repository';
import { EmailService } from '../../../common/email/email.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let repo: DeepMockProxy<IOrdersRepository>;
  let emailService: DeepMockProxy<EmailService>;

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
    items: [{ id: 'oi-1', orderId: 'order-1', productId: 'prod-1', name: 'Crema', price: 50000, quantity: 2 }],
  };

  beforeEach(async () => {
    repo = mockDeep<IOrdersRepository>();
    emailService = mockDeep<EmailService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: IOrdersRepository, useValue: repo },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();
    service = module.get<OrdersService>(OrdersService);
  });

  describe('findAll', () => {
    it('should delegate to repository with filters', async () => {
      repo.findAll.mockResolvedValue({ data: [mockOrder], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await service.findAll({ status: 'CONFIRMADO' });
      expect(result.data).toHaveLength(1);
      expect(repo.findAll).toHaveBeenCalledWith({ status: 'CONFIRMADO' });
    });
  });

  describe('findByUser', () => {
    it('should delegate to repository with user and pagination', async () => {
      repo.findByUser.mockResolvedValue({ data: [mockOrder], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await service.findByUser('user-1', { page: 2, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(repo.findByUser).toHaveBeenCalledWith('user-1', { page: 2, limit: 10 });
    });
  });

  describe('findById', () => {
    it('should delegate to repository', async () => {
      repo.findById.mockResolvedValue(mockOrder);
      const result = await service.findById('order-1');
      expect(result.id).toBe('order-1');
      expect(repo.findById).toHaveBeenCalledWith('order-1');
    });
  });

  describe('create', () => {
    it('should create an order with items', async () => {
      const data = {
        userId: 'user-1',
        total: 100000,
        shippingName: 'María Gómez',
        shippingEmail: 'maria@test.com',
        shippingPhone: '3001234567',
        shippingAddress: 'Calle 1',
        shippingCity: 'Bogotá',
        items: [{ productId: 'prod-1', name: 'Crema', price: 50000, quantity: 2 }],
      };
      repo.create.mockResolvedValue(mockOrder as any);

      const result = await service.create(data);

      expect(result.id).toBe('order-1');
      expect(repo.create).toHaveBeenCalledWith(data);
    });
  });

  describe('updateStatus', () => {
    it('should delegate status update to repository and send status email', async () => {
      repo.updateStatus.mockResolvedValue({ ...mockOrder, status: 'ENVIADO' });
      const result = await service.updateStatus('order-1', 'ENVIADO');
      expect(result.status).toBe('ENVIADO');
      expect(repo.updateStatus).toHaveBeenCalledWith('order-1', 'ENVIADO');
      expect(emailService.sendOrderStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-1',
          status: 'Enviado',
          clientEmail: 'maria@test.com',
        }),
      );
    });

    it('should not send email when order has no recipient email', async () => {
      repo.updateStatus.mockResolvedValue({ ...mockOrder, shippingEmail: '', user: undefined } as any);
      await service.updateStatus('order-1', 'CANCELADO');
      expect(emailService.sendOrderStatus).not.toHaveBeenCalled();
    });
  });
});
