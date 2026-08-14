import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';

@Module({
  imports: [PaymentsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
