import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IUsersRepository } from '../../repositories/interfaces/users.repository';
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

  private sanitizeUser(user: any) {
    const rest = { ...user };
    delete rest.passwordHash;
    delete rest.refreshToken;
    return rest;
  }
}
