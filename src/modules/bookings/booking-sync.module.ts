import { Global, Module } from '@nestjs/common';
import { BookingSyncService } from './booking-sync.service';

@Global()
@Module({
  providers: [BookingSyncService],
  exports: [BookingSyncService],
})
export class BookingSyncModule {}
