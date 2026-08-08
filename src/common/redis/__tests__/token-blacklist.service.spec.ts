import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { TokenBlacklistService } from '../token-blacklist.service';
import { RedisService } from '../redis.service';

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;
  let redis: DeepMockProxy<RedisService>;

  beforeEach(async () => {
    redis = mockDeep<RedisService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenBlacklistService, { provide: RedisService, useValue: redis }],
    }).compile();
    service = module.get<TokenBlacklistService>(TokenBlacklistService);
  });

  describe('add', () => {
    it('should store token with prefix and TTL', async () => {
      // Arrange
      const token = 'jwt-token-abc';
      const ttl = 900;

      // Act
      await service.add(token, ttl);

      // Assert
      expect(redis.set).toHaveBeenCalledWith(`auth:blacklist:${token}`, '1', 'EX', ttl);
    });

    it('should not throw when Redis is unavailable', async () => {
      // Arrange
      redis.set.mockRejectedValue(new Error('Redis down'));

      // Act & Assert
      await expect(service.add('token', 900)).resolves.not.toThrow();
    });
  });

  describe('isBlacklisted', () => {
    it('should return true when token is blacklisted', async () => {
      // Arrange
      redis.get.mockResolvedValue('1');

      // Act
      const result = await service.isBlacklisted('jwt-token-abc');

      // Assert
      expect(result).toBe(true);
      expect(redis.get).toHaveBeenCalledWith('auth:blacklist:jwt-token-abc');
    });

    it('should return false when token is not blacklisted', async () => {
      // Arrange
      redis.get.mockResolvedValue(null);

      // Act
      const result = await service.isBlacklisted('jwt-token-abc');

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when Redis is unavailable (graceful degradation)', async () => {
      // Arrange
      redis.get.mockRejectedValue(new Error('Redis down'));

      // Act
      const result = await service.isBlacklisted('jwt-token-abc');

      // Assert
      expect(result).toBe(false);
    });
  });
});
