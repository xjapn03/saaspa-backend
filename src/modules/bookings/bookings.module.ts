import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { PendingPaymentExpiryScheduler } from './pending-payment-expiry.scheduler';

@Module({
  imports: [PaymentsModule],
  controllers: [BookingsController],
  providers: [BookingsService, PendingPaymentExpiryScheduler],
  exports: [BookingsService],
})
export class BookingsModule {}
