import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { HealthController } from '../health.controller';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: DeepMockProxy<PrismaService>;
  let redis: DeepMockProxy<RedisService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    redis = mockDeep<RedisService>();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    controller = module.get<HealthController>(HealthController);
  });

  it('should return ok when DB and Redis are connected', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue(undefined);
    (redis.ping as jest.Mock).mockResolvedValue('PONG');

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.db).toBe('connected');
    expect(result.redis).toBe('connected');
    expect(result.uptime).toBeGreaterThan(0);
  });

  it('should return degraded when DB or Redis fails', async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB down'));
    (redis.ping as jest.Mock).mockResolvedValue('PONG');

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.db).toBe('disconnected');
    expect(result.redis).toBe('connected');
  });
});
