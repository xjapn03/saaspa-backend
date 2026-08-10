import { Global, Module } from '@nestjs/common';
import { IUsersRepository } from './interfaces/users.repository';
import { UsersRepository } from './users.repository';
import { IServicesRepository } from './interfaces/services.repository';
import { ServicesRepository } from './services.repository';

@Global()
@Module({
  providers: [
    { provide: IUsersRepository, useClass: UsersRepository },
    { provide: IServicesRepository, useClass: ServicesRepository },
  ],
  exports: [IUsersRepository, IServicesRepository],
})
export class RepositoriesModule {}
