import { Service } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface IServiceSafe {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration: number;
  isActive: boolean;
  category: string | null;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class IServicesRepository {
  abstract findAll(): Promise<IServiceSafe[]>;
  abstract findActive(): Promise<IServiceSafe[]>;
  abstract findById(id: string): Promise<IServiceSafe>;
  abstract create(data: Prisma.ServiceCreateInput): Promise<Service>;
  abstract update(id: string, data: Prisma.ServiceUpdateInput): Promise<IServiceSafe>;
  abstract remove(id: string): Promise<IServiceSafe>;
}
