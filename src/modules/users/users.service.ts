import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IUsersRepository } from '../../repositories/interfaces/users.repository';
import type { UserFilters } from '../../repositories/interfaces/users.repository';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private usersRepo: IUsersRepository) {}

  async findAll(filters?: UserFilters) {
    return this.usersRepo.findAll(filters);
  }

  async findById(id: string) {
    return this.usersRepo.findById(id);
  }

  async findByEmail(email: string) {
    return this.usersRepo.findByEmail(email);
  }

  async create(data: { email: string; password: string; firstName: string; lastName: string; phone?: string; description?: string; role?: string }) {
    const existing = await this.usersRepo.findByEmail(data.email);
    if (existing) throw new UnauthorizedException('El email ya está registrado');
    const passwordHash = await bcrypt.hash(data.password, 10);
    return this.usersRepo.create({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      description: data.description,
      role: data.role as any,
    } as any);
  }

  async update(id: string, data: Parameters<IUsersRepository['update']>[1]) {
    return this.usersRepo.update(id, data);
  }

  async remove(id: string) {
    return this.usersRepo.remove(id);
  }
}
