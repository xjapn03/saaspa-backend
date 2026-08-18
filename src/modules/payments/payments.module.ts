import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { IPaymentProvider } from './providers/payment-provider';
import { WompiPaymentProvider } from './providers/wompi.payment-provider';

@Module({
  imports: [],
  controllers: [PaymentsController],
  providers: [PaymentsService, { provide: IPaymentProvider, useClass: WompiPaymentProvider }],
  exports: [PaymentsService],
})
export class PaymentsModule {}
