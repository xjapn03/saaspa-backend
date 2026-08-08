import { Global, Module } from '@nestjs/common';
import { IUsersRepository } from './interfaces/users.repository';
import { UsersRepository } from './users.repository';

@Global()
@Module({
  providers: [{ provide: IUsersRepository, useClass: UsersRepository }],
  exports: [IUsersRepository],
})
export class RepositoriesModule {}
