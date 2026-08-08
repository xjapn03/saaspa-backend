import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { TokenService } from '../token.service';

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: DeepMockProxy<JwtService>;
  let configService: DeepMockProxy<ConfigService>;

  beforeEach(async () => {
    jwtService = mockDeep<JwtService>();
    configService = mockDeep<ConfigService>();
    configService.get.mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      if (key === 'JWT_REFRESH_EXPIRATION') return '7d';
      return defaultValue || '';
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = module.get<TokenService>(TokenService);
  });

  describe('generateTokens', () => {
    it('should return accessToken and refreshToken with correct payload', () => {
      // Arrange
      jwtService.sign.mockReturnValueOnce('access-token-abc');
      jwtService.sign.mockReturnValueOnce('refresh-token-xyz');

      // Act
      const tokens = service.generateTokens('user-1', 'test@test.com', 'ADMIN');

      // Assert
      expect(tokens.accessToken).toBe('access-token-abc');
      expect(tokens.refreshToken).toBe('refresh-token-xyz');
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(jwtService.sign).toHaveBeenNthCalledWith(1, {
        sub: 'user-1',
        email: 'test@test.com',
        role: 'ADMIN',
      });
      expect(jwtService.sign).toHaveBeenNthCalledWith(2, expect.any(Object), {
        expiresIn: '7d',
      });
    });

    it('should use default expiration when config is not set', () => {
      // Arrange
      configService.get.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'JWT_SECRET') return 'test-secret';
        return defaultValue as any;
      });
      jwtService.sign.mockReturnValue('token');

      // Act
      service.generateTokens('user-1', 'test@test.com', 'CLIENTE');

      // Assert
      expect(jwtService.sign).toHaveBeenNthCalledWith(2, expect.any(Object), {
        expiresIn: '7d',
      });
    });
  });

  describe('verifyToken', () => {
    it('should return decoded payload when token is valid', () => {
      // Arrange
      const payload = { sub: 'user-1', email: 'test@test.com', role: 'ADMIN' };
      jwtService.verify.mockReturnValue(payload);

      // Act
      const result = service.verifyToken('valid-token');

      // Assert
      expect(result).toEqual(payload);
      expect(jwtService.verify).toHaveBeenCalledWith('valid-token', {
        secret: 'test-secret',
      });
    });

    it('should throw when token is invalid', () => {
      // Arrange
      jwtService.verify.mockImplementation(() => {
        throw new Error('Token expired');
      });

      // Act & Assert
      expect(() => service.verifyToken('invalid-token')).toThrow('Token expired');
    });
  });
});
