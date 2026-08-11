import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './common/redis/redis.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { EmailModule } from './common/email/email.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ServicesModule } from './modules/services/services.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { GoogleCalendarModule } from './common/google-calendar/google-calendar.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { MetaModule } from './modules/meta/meta.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    RepositoriesModule,
    EmailModule,
    AuthModule,
    UsersModule,
    ServicesModule,
    BookingsModule,
    PaymentsModule,
    GoogleCalendarModule,
    CouponsModule,
    WhatsappModule,
    MetaModule,
    CategoriesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
