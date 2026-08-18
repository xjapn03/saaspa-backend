import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { Role } from '@prisma/client';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: DeepMockProxy<AuthService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@test.com',
    firstName: 'Test',
    lastName: 'User',
    phone: null,
    birthday: null,
    description: null,
    role: 'CLIENTE' as Role,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTokens = { accessToken: 'at', refreshToken: 'rt' };

  beforeEach(async () => {
    authService = mockDeep<AuthService>();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    controller = module.get<AuthController>(AuthController);
  });

  describe('register', () => {
    it('should return 201 with user and tokens', async () => {
      // Arrange
      const dto: RegisterDto = {
        email: 'new@test.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
      };
      const registeredUser = { ...mockUser, email: dto.email };
      authService.register.mockResolvedValue({
        user: registeredUser,
        ...mockTokens,
      });

      // Act
      const result = await controller.register(dto);

      // Assert
      expect(result.user.email).toBe(dto.email);
      expect(result.accessToken).toBe('at');
      expect(result.refreshToken).toBe('rt');
      expect(authService.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('login', () => {
    it('should set cookies and return user only', async () => {
      // Arrange
      const dto: LoginDto = { email: 'test@test.com', password: 'password123' };
      authService.login.mockResolvedValue({
        user: mockUser,
        ...mockTokens,
      });
      const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as any;

      // Act
      const result = await controller.login(mockRes, dto);

      // Assert
      expect(result.user.email).toBe(dto.email);
      expect(result).not.toHaveProperty('accessToken');
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(authService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('refresh', () => {
    it('should read refresh token from cookie and return new tokens', async () => {
      // Arrange
      authService.refresh.mockResolvedValue({
        accessToken: 'new-at',
        refreshToken: 'new-rt',
      });
      const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
      const mockReq = { cookies: { kamerinos_refresh_token: 'old-refresh-token' }, body: {} } as any;

      // Act
      const result = await controller.refresh(mockRes, mockReq);

      // Assert
      expect(result.accessToken).toBe('new-at');
      expect(result.refreshToken).toBe('new-rt');
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(authService.refresh).toHaveBeenCalledWith('old-refresh-token');
    });

    it('should fallback to body refresh token when cookie is missing', async () => {
      // Arrange
      authService.refresh.mockResolvedValue({
        accessToken: 'new-at',
        refreshToken: 'new-rt',
      });
      const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
      const mockReq = { cookies: {}, body: { refreshToken: 'body-refresh-token' } } as any;

      // Act
      const result = await controller.refresh(mockRes, mockReq);

      // Assert
      expect(authService.refresh).toHaveBeenCalledWith('body-refresh-token');
    });
  });

  describe('logout', () => {
    it('should call service with tokens and clear cookies', async () => {
      // Arrange
      authService.logout.mockResolvedValue(undefined);
      const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
      const mockReq = { cookies: {}, body: { refreshToken: 'refresh-token-abc' } } as any;

      // Act
      await controller.logout(mockRes, mockReq, 'Bearer access-token-abc');

      // Assert
      expect(authService.logout).toHaveBeenCalledWith('access-token-abc', 'refresh-token-abc');
      expect(mockRes.clearCookie).toHaveBeenCalled();
    });

    it('should read access token from cookie when no header', async () => {
      // Arrange
      authService.logout.mockResolvedValue(undefined);
      const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
      const mockReq = { cookies: { kamerinos_access_token: 'cookie-access', kamerinos_refresh_token: 'cookie-refresh' }, body: {} } as any;

      // Act
      await controller.logout(mockRes, mockReq, undefined as any);

      // Assert
      expect(authService.logout).toHaveBeenCalledWith('cookie-access', 'cookie-refresh');
      expect(mockRes.clearCookie).toHaveBeenCalled();
    });
  });
});
