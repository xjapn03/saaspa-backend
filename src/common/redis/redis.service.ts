import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private static parseConnection(configService: ConfigService) {
    const url = configService.get<string>('REDIS_URL');

    let host = configService.get<string>('REDIS_HOST') || 'localhost';
    let port = parseInt(configService.get<string>('REDIS_PORT') || '6379', 10);
    let password = configService.get<string>('REDIS_PASSWORD') || undefined;

    if (url) {
      try {
        const parsed = new URL(url);
        host = parsed.hostname || host;
        port = parsed.port ? parseInt(parsed.port, 10) : port;
        password = parsed.password ? decodeURIComponent(parsed.password) : password;
      } catch {
        new Logger(RedisService.name).warn('REDIS_URL inválida, usando REDIS_HOST/REDIS_PORT');
      }
    }

    return { host, port, password };
  }

  constructor(configService: ConfigService) {
    const { host, port, password } = RedisService.parseConnection(configService);

    super({
      host,
      port,
      password,
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
