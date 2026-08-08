import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export abstract class ITokenService {
  abstract generateTokens(
    userId: string,
    email: string,
    role: string,
  ): {
    accessToken: string;
    refreshToken: string;
  };
  abstract verifyToken(token: string): { sub: string; email: string; role: string };
  abstract decodeToken(
    token: string,
  ): { sub: string; email: string; role: string; exp?: number } | null;
}

@Injectable()
export class TokenService extends ITokenService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    super();
  }

  generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d') as `${number}d`,
    });
    return { accessToken, refreshToken };
  }

  verifyToken(token: string) {
    return this.jwtService.verify<{ sub: string; email: string; role: string }>(token, {
      secret: this.configService.get<string>('JWT_SECRET'),
    });
  }

  decodeToken(token: string) {
    return this.jwtService.decode<{
      sub: string;
      email: string;
      role: string;
      exp?: number;
    }>(token);
  }
}
