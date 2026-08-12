import { User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result';

export interface IUserSafe {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthday: Date | null;
  description: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserFilters {
  role?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export abstract class IUsersRepository {
  abstract findAll(filters?: UserFilters): Promise<PaginatedResult<IUserSafe>>;
  abstract findById(id: string): Promise<IUserSafe>;
  abstract findByEmail(email: string): Promise<User | null>;
  abstract findByIdWithCredentials(id: string): Promise<User | null>;
  abstract create(data: Prisma.UserCreateInput): Promise<User>;
  abstract update(id: string, data: Prisma.UserUpdateInput): Promise<IUserSafe>;
  abstract remove(id: string): Promise<IUserSafe>;
  abstract setRefreshToken(userId: string, refreshToken: string): Promise<User>;
}
