import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly prefix = 'auth:blacklist:';

  constructor(private redis: RedisService) {}

  async add(token: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(this.prefix + token, '1', 'EX', ttlSeconds);
    } catch {
      this.logger.warn('Redis no disponible, token no blacklisteado.');
    }
  }

  async isBlacklisted(token: string): Promise<boolean> {
    try {
      const value = await this.redis.get(this.prefix + token);
      return value === '1';
    } catch {
      return false;
    }
  }
}
