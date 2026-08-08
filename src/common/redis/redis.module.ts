import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { TokenBlacklistService } from './token-blacklist.service';

@Global()
@Module({
  providers: [RedisService, TokenBlacklistService],
  exports: [RedisService, TokenBlacklistService],
})
export class RedisModule {}
