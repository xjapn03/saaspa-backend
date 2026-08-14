import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';

@Module({
  imports: [],
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}
