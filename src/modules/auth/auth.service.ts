import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { IUsersRepository } from '../../repositories/interfaces/users.repository';
import { PrismaService } from '../../database/prisma.service';
import { TokenBlacklistService } from '../../common/redis/token-blacklist.service';
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

    return { user: this.sanitizeUser(user), ...tokens };
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

    this.logger.log(`Password reset token generated for ${email}. URL: ${resetUrl}`);

    const sendgridKey = this.config.get('SENDGRID_API_KEY');
    if (sendgridKey) {
      try {
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [{ to: [{ email }] }],
            from: { email: 'info@kamerinosspa.com', name: 'Kamerinos SPA' },
            subject: 'Restablece tu contraseña — Kamerinos SPA',
            content: [{ type: 'text/html', value: `<p>Hola,</p><p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el enlace para continuar:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este mensaje.</p>` }],
          }),
        });
      } catch (err: any) {
        this.logger.warn(`SendGrid falló: ${err.message}. El token se generó pero no se envió por email.`);
      }
    }

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

  private sanitizeUser(user: any) {
    const rest = { ...user };
    delete rest.passwordHash;
    delete rest.refreshToken;
    return rest;
  }
}
