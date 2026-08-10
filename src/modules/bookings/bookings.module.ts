import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';

@Module({
  imports: [],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
