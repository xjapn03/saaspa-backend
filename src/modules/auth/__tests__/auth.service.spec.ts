import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';
import { IUsersRepository } from '../../../repositories/interfaces/users.repository';
import { TokenBlacklistService } from '../../../common/redis/token-blacklist.service';
import { TokenService } from '../token.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { Role } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: DeepMockProxy<IUsersRepository>;
  let tokenService: DeepMockProxy<TokenService>;
  let tokenBlacklist: DeepMockProxy<TokenBlacklistService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@test.com',
    passwordHash: '',
    firstName: 'Test',
    lastName: 'User',
    phone: null,
    birthday: null,
    description: null,
    role: 'CLIENTE' as Role,
    isActive: true,
    refreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    usersRepo = mockDeep<IUsersRepository>();
    tokenService = mockDeep<TokenService>();
    tokenBlacklist = mockDeep<TokenBlacklistService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: IUsersRepository, useValue: usersRepo },
        { provide: TokenService, useValue: tokenService },
        { provide: TokenBlacklistService, useValue: tokenBlacklist },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    const dto: RegisterDto = {
      email: 'new@test.com',
      password: 'password123',
      firstName: 'New',
      lastName: 'User',
      phone: '3001234567',
      birthday: '1990-05-15',
      description: 'A test user',
      role: 'CLIENTE',
    };

    it('should create user and return tokens', async () => {
      // Arrange
      usersRepo.findByEmail.mockResolvedValue(null);
      usersRepo.create.mockResolvedValue({
        ...mockUser,
        email: dto.email,
        firstName: dto.firstName,
      });
      tokenService.generateTokens.mockReturnValue({
        accessToken: 'at',
        refreshToken: 'rt',
      });
      usersRepo.setRefreshToken.mockResolvedValue({ ...mockUser, refreshToken: 'rt' });

      // Act
      const result = await service.register(dto);

      // Assert
      expect(result.accessToken).toBe('at');
      expect(result.refreshToken).toBe('rt');
      expect(result.user.email).toBe(dto.email);
      expect(usersRepo.findByEmail).toHaveBeenCalledWith(dto.email);
      expect(usersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: dto.email,
          firstName: dto.firstName,
          birthday: expect.any(Date),
        }),
      );
      expect(tokenService.generateTokens).toHaveBeenCalled();
      expect(usersRepo.setRefreshToken).toHaveBeenCalledWith('user-1', 'rt');
    });

    it('should throw UnauthorizedException when email already exists', async () => {
      // Arrange
      usersRepo.findByEmail.mockResolvedValue({ ...mockUser, email: dto.email });

      // Act & Assert
      await expect(service.register(dto)).rejects.toThrow(UnauthorizedException);
      expect(usersRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto: LoginDto = { email: 'test@test.com', password: 'password123' };

    it('should return tokens on valid credentials', async () => {
      // Arrange
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      usersRepo.findByEmail.mockResolvedValue({
        ...mockUser,
        email: dto.email,
        passwordHash: hashedPassword,
      });
      tokenService.generateTokens.mockReturnValue({
        accessToken: 'at',
        refreshToken: 'rt',
      });
      usersRepo.setRefreshToken.mockResolvedValue({ ...mockUser, refreshToken: 'rt' });

      // Act
      const result = await service.login(dto);

      // Assert
      expect(result.accessToken).toBe('at');
      expect(result.user.email).toBe(dto.email);
    });

    it('should throw UnauthorizedException when email not found', async () => {
      // Arrange
      usersRepo.findByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      // Arrange
      usersRepo.findByEmail.mockResolvedValue({
        ...mockUser,
        passwordHash: await bcrypt.hash('different-password', 10),
      });

      // Act & Assert
      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('should return new tokens when refresh token is valid and matches', async () => {
      // Arrange
      const payload = { sub: 'user-1', email: 'test@test.com', role: 'CLIENTE' };
      tokenService.verifyToken.mockReturnValue(payload);
      usersRepo.findByIdWithCredentials.mockResolvedValue({
        ...mockUser,
        refreshToken: 'valid-refresh-token',
      });
      tokenService.generateTokens.mockReturnValue({
        accessToken: 'new-at',
        refreshToken: 'new-rt',
      });
      usersRepo.setRefreshToken.mockResolvedValue(mockUser as any);

      // Act
      const result = await service.refresh('valid-refresh-token');

      // Assert
      expect(result.accessToken).toBe('new-at');
      expect(result.refreshToken).toBe('new-rt');
      expect(tokenService.verifyToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(usersRepo.setRefreshToken).toHaveBeenCalledWith('user-1', 'new-rt');
    });

    it('should throw UnauthorizedException when stored token does not match', async () => {
      // Arrange
      tokenService.verifyToken.mockReturnValue({
        sub: 'user-1',
        email: 'test@test.com',
        role: 'CLIENTE',
      });
      usersRepo.findByIdWithCredentials.mockResolvedValue({
        ...mockUser,
        refreshToken: 'different-token',
      });

      // Act & Assert
      await expect(service.refresh('valid-refresh-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when token cannot be verified', async () => {
      // Arrange
      tokenService.verifyToken.mockImplementation(() => {
        throw new Error('Token expired');
      });

      // Act & Assert
      await expect(service.refresh('invalid-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should blacklist access token and clear refresh token', async () => {
      // Arrange
      const accessToken = 'access-token-abc';
      const refreshToken = 'refresh-token-abc';
      tokenService.decodeToken.mockReturnValue({
        sub: 'user-1',
        email: 'test@test.com',
        role: 'CLIENTE',
        exp: Math.floor(Date.now() / 1000) + 900,
      });
      tokenService.verifyToken.mockReturnValue({
        sub: 'user-1',
        email: 'test@test.com',
        role: 'CLIENTE',
      });

      // Act
      await service.logout(accessToken, refreshToken);

      // Assert
      expect(tokenService.decodeToken).toHaveBeenCalledWith(accessToken);
      expect(tokenBlacklist.add).toHaveBeenCalledWith(accessToken, expect.any(Number));
      expect(usersRepo.setRefreshToken).toHaveBeenCalledWith('user-1', '');
    });

    it('should not blacklist an already expired access token', async () => {
      // Arrange
      tokenService.decodeToken.mockReturnValue({
        sub: 'user-1',
        email: 'test@test.com',
        role: 'CLIENTE',
        exp: Math.floor(Date.now() / 1000) - 100,
      });

      // Act
      await service.logout('expired-token');

      // Assert
      expect(tokenBlacklist.add).not.toHaveBeenCalled();
    });

    it('should not throw when Redis is unavailable', async () => {
      // Arrange
      tokenService.decodeToken.mockReturnValue({
        sub: 'user-1',
        email: 'test@test.com',
        role: 'CLIENTE',
        exp: Math.floor(Date.now() / 1000) + 900,
      });
      tokenBlacklist.add.mockRejectedValue(new Error('Redis down'));

      // Act & Assert
      await expect(service.logout('access-token')).resolves.not.toThrow();
    });

    it('should not throw when no tokens are provided', async () => {
      // Act & Assert
      await expect(service.logout('', '')).resolves.not.toThrow();
    });
  });

  describe('validateUser', () => {
    it('should return user when found', async () => {
      // Arrange
      usersRepo.findById.mockResolvedValue({
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
      });

      // Act
      const result = await service.validateUser('user-1');

      // Assert
      expect(result?.email).toBe('test@test.com');
    });
  });
});
