import { ConfigService } from '@nestjs/config';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { RedisService } from '../redis.service';

describe('RedisService', () => {
  let config: DeepMockProxy<ConfigService>;
  let service: RedisService;

  beforeEach(() => {
    config = mockDeep<ConfigService>();
    config.get.mockImplementation((key: string) => {
      if (key === 'REDIS_HOST') return 'localhost';
      if (key === 'REDIS_PORT') return '6379';
      if (key === 'REDIS_PASSWORD') return undefined;
      return undefined;
    });

    service = new RedisService(config);
  });

  afterEach(async () => {
    try {
      await service.quit();
    } catch {
      // ignore
    }
  });

  describe('constructor', () => {
    it('should initialize with config values', () => {
      // Assert
      expect(service.options).toBeDefined();
      expect(service.options.host).toBe('localhost');
      expect(service.options.port).toBe(6379);
      expect(service.options.lazyConnect).toBe(true);
    });

    it('should parse REDIS_URL when provided', async () => {
      const urlConfig = mockDeep<ConfigService>();
      urlConfig.get.mockImplementation((key: string) => {
        if (key === 'REDIS_URL') return 'redis://redis:6380';
        return undefined;
      });

      const urlService = new RedisService(urlConfig);
      expect(urlService.options.host).toBe('redis');
      expect(urlService.options.port).toBe(6380);
      try { await urlService.quit(); } catch { /* ignore */ }
    });

    it('should fall back to REDIS_HOST when REDIS_URL is absent', () => {
      expect(service.options.host).toBe('localhost');
      expect(service.options.port).toBe(6379);
    });
  });

  describe('onModuleDestroy', () => {
    it('should quit connection when Redis is ready', async () => {
      // Arrange
      Object.defineProperty(service, 'status', { value: 'ready', writable: true });
      const quitSpy = jest.spyOn(service, 'quit').mockResolvedValue('OK');

      // Act
      await service.onModuleDestroy();

      // Assert
      expect(quitSpy).toHaveBeenCalled();
      quitSpy.mockRestore();
    });

    it('should not quit when Redis is not connected', async () => {
      // Arrange
      Object.defineProperty(service, 'status', { value: 'end', writable: true });
      const quitSpy = jest.spyOn(service, 'quit').mockResolvedValue('OK');

      // Act
      await service.onModuleDestroy();

      // Assert
      expect(quitSpy).not.toHaveBeenCalled();
      quitSpy.mockRestore();
    });
  });
});
