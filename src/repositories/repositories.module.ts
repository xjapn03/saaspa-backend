import { Global, Module } from '@nestjs/common';
import { IUsersRepository } from './interfaces/users.repository';
import { UsersRepository } from './users.repository';
import { IServicesRepository } from './interfaces/services.repository';
import { ServicesRepository } from './services.repository';
import { IBookingsRepository } from './interfaces/bookings.repository';
import { BookingsRepository } from './bookings.repository';
import { IPaymentsRepository } from './interfaces/payments.repository';
import { PaymentsRepository } from './payments.repository';
import { ICategoriesRepository } from './interfaces/categories.repository';
import { CategoriesRepository } from './categories.repository';
import { IProductsRepository } from './interfaces/products.repository';
import { ProductsRepository } from './products.repository';
import { ICouponsRepository } from './interfaces/coupons.repository';
import { CouponsRepository } from './coupons.repository';
import { ICartRepository } from './interfaces/cart.repository';
import { CartRepository } from './cart.repository';
import { IOrdersRepository } from './interfaces/orders.repository';
import { OrdersRepository } from './orders.repository';

@Global()
@Module({
  providers: [
    { provide: IUsersRepository, useClass: UsersRepository },
    { provide: IServicesRepository, useClass: ServicesRepository },
    { provide: IBookingsRepository, useClass: BookingsRepository },
    { provide: IPaymentsRepository, useClass: PaymentsRepository },
    { provide: ICouponsRepository, useClass: CouponsRepository },
    { provide: ICategoriesRepository, useClass: CategoriesRepository },
    { provide: IProductsRepository, useClass: ProductsRepository },
    { provide: ICartRepository, useClass: CartRepository },
    { provide: IOrdersRepository, useClass: OrdersRepository },
  ],
  exports: [IUsersRepository, IServicesRepository, IBookingsRepository, IPaymentsRepository, ICouponsRepository, ICategoriesRepository, IProductsRepository, ICartRepository, IOrdersRepository],
})
export class RepositoriesModule {}
