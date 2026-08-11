import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check — verifica DB, Redis y uptime' })
  async check() {
    let db = 'disconnected';
    let redis = 'disconnected';
    try { await this.prisma.$queryRaw`SELECT 1`; db = 'connected'; } catch {}
    try { await this.redis.ping(); redis = 'connected'; } catch {}
    return { status: db === 'connected' && redis === 'connected' ? 'ok' : 'degraded', db, redis, uptime: process.uptime() };
  }
}
