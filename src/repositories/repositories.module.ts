import { Global, Module } from '@nestjs/common';
import { IUsersRepository } from './interfaces/users.repository';
import { UsersRepository } from './users.repository';
import { IServicesRepository } from './interfaces/services.repository';
import { ServicesRepository } from './services.repository';
import { IBookingsRepository } from './interfaces/bookings.repository';
import { BookingsRepository } from './bookings.repository';

@Global()
@Module({
  providers: [
    { provide: IUsersRepository, useClass: UsersRepository },
    { provide: IServicesRepository, useClass: ServicesRepository },
    { provide: IBookingsRepository, useClass: BookingsRepository },
  ],
  exports: [IUsersRepository, IServicesRepository, IBookingsRepository],
})
export class RepositoriesModule {}
