import { Global, Module } from '@nestjs/common';
import { IUsersRepository } from './interfaces/users.repository';
import { UsersRepository } from './users.repository';
import { IServicesRepository } from './interfaces/services.repository';
import { ServicesRepository } from './services.repository';
import { IBookingsRepository } from './interfaces/bookings.repository';
import { BookingsRepository } from './bookings.repository';
import { IPaymentsRepository } from './interfaces/payments.repository';
import { PaymentsRepository } from './payments.repository';
import { ICouponsRepository } from './interfaces/coupons.repository';
import { CouponsRepository } from './coupons.repository';

@Global()
@Module({
  providers: [
    { provide: IUsersRepository, useClass: UsersRepository },
    { provide: IServicesRepository, useClass: ServicesRepository },
    { provide: IBookingsRepository, useClass: BookingsRepository },
    { provide: IPaymentsRepository, useClass: PaymentsRepository },
    { provide: ICouponsRepository, useClass: CouponsRepository },
  ],
  exports: [IUsersRepository, IServicesRepository, IBookingsRepository, IPaymentsRepository, ICouponsRepository],
})
export class RepositoriesModule {}
