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
    it('should return 200 with user and tokens', async () => {
      // Arrange
      const dto: LoginDto = { email: 'test@test.com', password: 'password123' };
      authService.login.mockResolvedValue({
        user: mockUser,
        ...mockTokens,
      });

      // Act
      const result = await controller.login(dto);

      // Assert
      expect(result.user.email).toBe(dto.email);
      expect(result.accessToken).toBe('at');
      expect(authService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('refresh', () => {
    it('should return 200 with new tokens', async () => {
      // Arrange
      authService.refresh.mockResolvedValue({
        accessToken: 'new-at',
        refreshToken: 'new-rt',
      });

      // Act
      const result = await controller.refresh('old-refresh-token');

      // Assert
      expect(result.accessToken).toBe('new-at');
      expect(result.refreshToken).toBe('new-rt');
      expect(authService.refresh).toHaveBeenCalledWith('old-refresh-token');
    });
  });
});
