import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
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

  /**
   * Both PATCH /users/me and PATCH /users/:id land here.
   *
   * The profile DTOs accept `birthday` as a date string (@IsDateString), but the
   * column is a DateTime and Prisma rejects a plain string, which used to surface
   * as a 500. It is converted here, exactly like AuthService.register does.
   */
  async update(id: string, data: Parameters<IUsersRepository['update']>[1]) {
    const normalized = { ...data };

    if (typeof normalized.birthday === 'string') {
      const birthday = new Date(normalized.birthday);
      if (Number.isNaN(birthday.getTime())) {
        throw new BadRequestException('birthday debe ser una fecha válida (YYYY-MM-DD)');
      }
      normalized.birthday = birthday;
    }

    return this.usersRepo.update(id, normalized);
  }

  async remove(id: string) {
    return this.usersRepo.remove(id);
  }
}
