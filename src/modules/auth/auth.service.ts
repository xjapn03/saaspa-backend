import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { IUsersRepository } from '../../repositories/interfaces/users.repository';
import { PrismaService } from '../../database/prisma.service';
import { TokenBlacklistService } from '../../common/redis/token-blacklist.service';
import { EmailService } from '../../common/email/email.service';
import { TokenService } from './token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersRepo: IUsersRepository,
    private tokenService: TokenService,
    private tokenBlacklist: TokenBlacklistService,
    private prisma: PrismaService,
    private config: ConfigService,
    private emailService: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) {
      throw new UnauthorizedException('El email ya está registrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersRepo.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      birthday: dto.birthday ? new Date(dto.birthday) : undefined,
      description: dto.description,
      role: dto.role,
    });

    const tokens = this.tokenService.generateTokens(user.id, user.email, user.role);
    await this.usersRepo.setRefreshToken(user.id, tokens.refreshToken);

    const verificationToken = crypto.randomBytes(32).toString('hex');
    await this.prisma.verificationToken.upsert({
      where: { userId: user.id },
      update: { token: verificationToken, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      create: { userId: user.id, token: verificationToken, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    const frontendBase = this.config.get<string>('CORS_ORIGIN')?.split(',')[0] || 'http://localhost:3000';
    const verifyUrl = `${frontendBase}/verificar-email/${verificationToken}`;
    const userName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : '';
    this.emailService.sendWelcomeEmail({
      clientName: userName || 'Cliente',
      clientEmail: user.email,
      verifyUrl,
    });

    return { user: this.sanitizeUser(user), ...tokens };
  }

  async verifyEmail(token: string) {
    const verificationToken = await this.prisma.verificationToken.findUnique({ where: { token } });

    if (!verificationToken) {
      return { verified: true, message: 'Tu cuenta ya está verificada. Ya puedes iniciar sesión.' };
    }

    if (verificationToken.expiresAt < new Date()) {
      throw new UnauthorizedException('El enlace de verificación ha expirado. Solicita uno nuevo.');
    }

    await this.usersRepo.update(verificationToken.userId, { emailVerified: true } as any);
    await this.prisma.verificationToken.delete({ where: { id: verificationToken.id } });

    return { verified: true, message: 'Cuenta verificada correctamente. Ya puedes iniciar sesión.' };
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepo.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const tokens = this.tokenService.generateTokens(user.id, user.email, user.role);
    await this.usersRepo.setRefreshToken(user.id, tokens.refreshToken);

    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.tokenService.verifyToken(refreshToken);
      const user = await this.usersRepo.findByIdWithCredentials(payload.sub);

      if (!user || user.refreshToken !== refreshToken) {
        throw new UnauthorizedException('Token inválido');
      }

      const tokens = this.tokenService.generateTokens(user.id, user.email, user.role);
      await this.usersRepo.setRefreshToken(user.id, tokens.refreshToken);

      return tokens;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  async logout(accessToken: string, refreshToken?: string): Promise<void> {
    if (accessToken) {
      try {
        const payload = this.tokenService.decodeToken(accessToken);
        if (payload?.exp) {
          const remaining = payload.exp - Math.floor(Date.now() / 1000);
          if (remaining > 0) {
            await this.tokenBlacklist.add(accessToken, remaining);
          }
        }
      } catch {
        this.logger.warn('No se pudo blacklistear el access token.');
      }
    }

    if (refreshToken) {
      try {
        const payload = this.tokenService.verifyToken(refreshToken);
        await this.usersRepo.setRefreshToken(payload.sub, '');
      } catch {
        this.logger.warn('Refresh token inválido al hacer logout.');
      }
    }
  }

  async validateUser(userId: string) {
    return this.usersRepo.findById(userId);
  }

  async forgotPassword(email: string) {
    const user = await this.usersRepo.findByEmail(email);
    if (!user) {
      this.logger.warn(`Intento de recuperación para email inexistente: ${email}`);
      return { message: 'Si el correo existe en nuestro sistema, recibirás instrucciones para restablecer tu contraseña.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await this.prisma.resetToken.deleteMany({ where: { email } });
    await this.prisma.resetToken.create({ data: { email, token, expiresAt } });

    const resetUrl = `${this.config.get('CORS_ORIGIN')?.split(',')[0] || 'http://localhost:3000'}/recuperar/${token}`;

    const userName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : '';
    this.emailService.sendPasswordReset(email, userName, resetUrl);

    return { message: 'Si el correo existe en nuestro sistema, recibirás instrucciones para restablecer tu contraseña.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const resetToken = await this.prisma.resetToken.findUnique({ where: { token } });
    if (!resetToken || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException('El enlace de recuperación no es válido o ha expirado.');
    }

    const user = await this.usersRepo.findByEmail(resetToken.email);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersRepo.update(user.id, { passwordHash } as any);
    await this.prisma.resetToken.delete({ where: { id: resetToken.id } });

    return { message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' };
  }

  async requestEmailChange(userId: string, newEmail: string) {
    const existing = await this.usersRepo.findByEmail(newEmail);
    if (existing) {
      throw new ConflictException('Ese correo ya está en uso');
    }

    const user = await this.usersRepo.findById(userId);
    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.emailChangeCode.upsert({
      where: { userId },
      update: { newEmail, codeHash, expiresAt },
      create: { userId, newEmail, codeHash, expiresAt },
    });

    const userName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : '';
    this.emailService.sendEmailChangeCode(newEmail, userName, code);

    return { message: `Enviamos un código de verificación a ${newEmail}.` };
  }

  async confirmEmailChange(userId: string, code: string) {
    const record = await this.prisma.emailChangeCode.findUnique({ where: { userId } });
    if (!record) {
      throw new UnauthorizedException('No hay una solicitud de cambio de correo activa.');
    }

    if (record.expiresAt < new Date()) {
      await this.prisma.emailChangeCode.delete({ where: { userId } });
      throw new UnauthorizedException('El código ha expirado. Solicita uno nuevo.');
    }

    const valid = await bcrypt.compare(code, record.codeHash);
    if (!valid) {
      throw new UnauthorizedException('Código incorrecto.');
    }

    await this.usersRepo.update(userId, { email: record.newEmail } as any);
    await this.usersRepo.setRefreshToken(userId, '');
    await this.prisma.emailChangeCode.delete({ where: { userId } });

    return { message: 'Correo actualizado correctamente. Inicia sesión de nuevo con tu nuevo correo.' };
  }

  private sanitizeUser(user: any) {
    const rest = { ...user };
    delete rest.passwordHash;
    delete rest.refreshToken;
    return rest;
  }
}
