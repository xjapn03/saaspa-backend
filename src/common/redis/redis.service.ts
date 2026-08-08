import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(configService: ConfigService) {
    super({
      host: configService.get<string>('REDIS_HOST') || 'localhost',
      port: parseInt(configService.get<string>('REDIS_PORT') || '6379', 10),
      password: configService.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 100, 1000)),
    });

    this.on('ready', () => this.logger.log('Redis conectado'));
    this.on('error', (err) => this.logger.warn(`Redis no disponible: ${err.message}`));
  }

  async onModuleInit() {
    try {
      await this.connect();
    } catch (err: any) {
      this.logger.warn(`No se pudo conectar a Redis: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.status === 'ready') {
      await this.quit();
    }
  }
}
