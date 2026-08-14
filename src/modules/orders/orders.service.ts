import { Injectable, Logger } from '@nestjs/common';
import { IOrdersRepository, OrderFilters } from '../../repositories/interfaces/orders.repository';
import { EmailService } from '../../common/email/email.service';

const STATUS_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADO: 'Confirmado',
  ENVIADO: 'Enviado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private ordersRepo: IOrdersRepository,
    private emailService: EmailService,
  ) {}

  async findAll(filters?: OrderFilters) { return this.ordersRepo.findAll(filters); }
  async findByUser(userId: string, filters?: { page?: number; limit?: number }) { return this.ordersRepo.findByUser(userId, filters); }
  async findById(id: string) { return this.ordersRepo.findById(id); }

  async create(data: {
    userId: string; total: number;
    shippingName: string; shippingEmail: string; shippingPhone: string;
    shippingAddress: string; shippingCity: string; shippingNotes?: string;
    paymentId?: string;
    items: { productId: string; name: string; price: number; quantity: number }[];
  }) {
    return this.ordersRepo.create(data);
  }

  async updateStatus(id: string, status: string) {
    const updated = await this.ordersRepo.updateStatus(id, status);

    const recipient = (updated as any)?.shippingEmail || (updated as any)?.user?.email;
    if (recipient) {
      try {
        await this.emailService.sendOrderStatus({
          clientName: (updated as any)?.shippingName || `${(updated as any)?.user?.firstName || ''} ${(updated as any)?.user?.lastName || ''}`.trim() || 'Cliente',
          clientEmail: recipient,
          orderId: (updated as any).id,
          status: STATUS_LABELS[status] || status,
          items: (updated as any).items || [],
          total: Number((updated as any).total || 0),
        });
      } catch (err: any) {
        this.logger.warn(`No se pudo enviar el email de estado del pedido ${id}: ${err?.message}`);
      }
    }

    return updated;
  }
}
