import { Global, Module } from '@nestjs/common';
import { MetaCapiService } from './meta-capi.service';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [MetaCapiService],
  exports: [MetaCapiService],
})
export class MetaModule {}
