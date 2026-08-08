import { Injectable } from '@nestjs/common';
import { IUsersRepository } from '../../repositories/interfaces/users.repository';

@Injectable()
export class UsersService {
  constructor(private usersRepo: IUsersRepository) {}

  async findAll() {
    return this.usersRepo.findAll();
  }

  async findById(id: string) {
    return this.usersRepo.findById(id);
  }

  async findByEmail(email: string) {
    return this.usersRepo.findByEmail(email);
  }

  async update(id: string, data: Parameters<IUsersRepository['update']>[1]) {
    return this.usersRepo.update(id, data);
  }

  async remove(id: string) {
    return this.usersRepo.remove(id);
  }
}
