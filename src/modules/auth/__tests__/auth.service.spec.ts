import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth.service';
import { IUsersRepository } from '../../../repositories/interfaces/users.repository';
import { PrismaService } from '../../../database/prisma.service';
import { TokenBlacklistService } from '../../../common/redis/token-blacklist.service';
import { EmailService } from '../../../common/email/email.service';
import { TokenService } from '../token.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { Role } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: DeepMockProxy<IUsersRepository>;
  let tokenService: DeepMockProxy<TokenService>;
  let tokenBlacklist: DeepMockProxy<TokenBlacklistService>;
  let prisma: DeepMockProxy<PrismaService>;
  let emailService: DeepMockProxy<EmailService>;

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
    emailVerified: false,
    refreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    usersRepo = mockDeep<IUsersRepository>();
    tokenService = mockDeep<TokenService>();
    tokenBlacklist = mockDeep<TokenBlacklistService>();
    prisma = mockDeep<PrismaService>();
    emailService = mockDeep<EmailService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: IUsersRepository, useValue: usersRepo },
        { provide: TokenService, useValue: tokenService },
        { provide: TokenBlacklistService, useValue: tokenBlacklist },
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
        { provide: ConfigService, useValue: new ConfigService({ CORS_ORIGIN: 'http://localhost:3000' }) },
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
        emailVerified: true,
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

    it('should throw when email is not verified', async () => {
      // Arrange
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      usersRepo.findByEmail.mockResolvedValue({
        ...mockUser,
        email: dto.email,
        passwordHash: hashedPassword,
        emailVerified: false,
      });

      // Act & Assert
      await expect(service.login(dto)).rejects.toThrow('Debes verificar tu correo');
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

  describe('resendVerification', () => {
    it('should regenerate token and send welcome email when user exists', async () => {
      usersRepo.findByEmail.mockResolvedValue(mockUser as any);
      prisma.verificationToken.upsert.mockResolvedValue({} as any);
      emailService.sendWelcomeEmail.mockResolvedValue();

      const result = await service.resendVerification('test@test.com');

      expect(prisma.verificationToken.upsert).toHaveBeenCalled();
      expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith(
        expect.objectContaining({ clientEmail: 'test@test.com' }),
      );
      expect(result.message).toContain('nuevo enlace');
    });

    it('should return a generic message when email does not exist', async () => {
      usersRepo.findByEmail.mockResolvedValue(null);

      const result = await service.resendVerification('missing@test.com');

      expect(result.message).toContain('Si el correo existe');
      expect(emailService.sendWelcomeEmail).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('should update the password and clear refresh token when current password matches', async () => {
      usersRepo.findByIdWithCredentials.mockResolvedValue({
        ...mockUser,
        passwordHash: await bcrypt.hash('oldpass123', 10),
      } as any);
      usersRepo.update.mockResolvedValue({ ...mockUser } as any);
      usersRepo.setRefreshToken.mockResolvedValue({ ...mockUser } as any);

      const result = await service.changePassword('user-1', 'oldpass123', 'newpass123');

      expect(usersRepo.update).toHaveBeenCalledWith('user-1', expect.objectContaining({ passwordHash: expect.any(String) }));
      expect(usersRepo.setRefreshToken).toHaveBeenCalledWith('user-1', '');
      expect(result.message).toContain('Contraseña actualizada');
    });

    it('should throw when current password is wrong', async () => {
      usersRepo.findByIdWithCredentials.mockResolvedValue({
        ...mockUser,
        passwordHash: await bcrypt.hash('correct-password', 10),
      } as any);

      await expect(service.changePassword('user-1', 'wrong-password', 'newpass123')).rejects.toThrow('La contraseña actual es incorrecta');
    });

    it('should throw when new password is too short', async () => {
      usersRepo.findByIdWithCredentials.mockResolvedValue({
        ...mockUser,
        passwordHash: await bcrypt.hash('correct-password', 10),
      } as any);

      await expect(service.changePassword('user-1', 'correct-password', '123')).rejects.toThrow('al menos 6 caracteres');
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

  describe('verifyEmail', () => {
    it('should mark user as verified and delete the token', async () => {
      // Arrange
      prisma.verificationToken.findUnique.mockResolvedValue({
        id: 'vt-1',
        userId: 'user-1',
        token: 'token-abc',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(),
      } as any);

      // Act
      const result = await service.verifyEmail('token-abc');

      // Assert
      expect(result.verified).toBe(true);
      expect(usersRepo.update).toHaveBeenCalledWith('user-1', { emailVerified: true } as any);
      expect(prisma.verificationToken.delete).toHaveBeenCalledWith({ where: { id: 'vt-1' } });
    });

    it('should be idempotent and return success when token already consumed', async () => {
      // Arrange
      prisma.verificationToken.findUnique.mockResolvedValue(null);

      // Act
      const result = await service.verifyEmail('used-token');

      // Assert
      expect(result.verified).toBe(true);
      expect(usersRepo.update).not.toHaveBeenCalled();
      expect(prisma.verificationToken.delete).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      // Arrange
      prisma.verificationToken.findUnique.mockResolvedValue({
        id: 'vt-expired',
        userId: 'user-1',
        token: 'expired-token',
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      } as any);

      // Act & Assert
      await expect(service.verifyEmail('expired-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('requestEmailChange', () => {
    it('should throw ConflictException when email is already in use', async () => {
      // Arrange
      usersRepo.findByEmail.mockResolvedValue({ id: 'other', email: 'taken@test.com' } as any);

      // Act & Assert
      await expect(service.requestEmailChange('user-1', 'taken@test.com')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.emailChangeCode.upsert).not.toHaveBeenCalled();
    });

    it('should generate a code and upsert it', async () => {
      // Arrange
      usersRepo.findByEmail.mockResolvedValue(null);
      usersRepo.findById.mockResolvedValue({ id: 'user-1', firstName: 'Maria', lastName: 'Gomez' } as any);

      // Act
      const result = await service.requestEmailChange('user-1', 'new@test.com');

      // Assert
      expect(result.message).toContain('new@test.com');
      expect(prisma.emailChangeCode.upsert).toHaveBeenCalled();
      expect(emailService.sendEmailChangeCode).toHaveBeenCalledWith('new@test.com', expect.any(String), expect.stringMatching(/^\d{6}$/));
    });
  });

  describe('confirmEmailChange', () => {
    it('should throw UnauthorizedException when there is no pending request', async () => {
      // Arrange
      prisma.emailChangeCode.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.confirmEmailChange('user-1', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when code is wrong', async () => {
      // Arrange
      const hash = await bcrypt.hash('999999', 4);
      prisma.emailChangeCode.findUnique.mockResolvedValue({
        id: 'ec-1',
        userId: 'user-1',
        newEmail: 'new@test.com',
        codeHash: hash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      } as any);

      // Act & Assert
      await expect(service.confirmEmailChange('user-1', '000000')).rejects.toThrow(UnauthorizedException);
      expect(usersRepo.update).not.toHaveBeenCalled();
    });
  });
});
