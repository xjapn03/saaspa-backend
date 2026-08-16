import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, Headers, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ACCESS_COOKIE, REFRESH_COOKIE, setAuthCookies, clearAuthCookies } from '../../common/auth/cookies';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar nuevo usuario' })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ status: 200, description: 'Login exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  async login(@Res({ passthrough: true }) res: Response, @Body() dto: LoginDto) {
    const { user, accessToken, refreshToken } = await this.authService.login(dto);
    setAuthCookies(res, accessToken, refreshToken);
    return { user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refrescar access token' })
  async refresh(@Res({ passthrough: true }) res: Response, @Req() req: Request) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE] ?? (req.body as any)?.refreshToken;
    const { accessToken, refreshToken: newRefresh } = await this.authService.refresh(refreshToken);
    setAuthCookies(res, accessToken, newRefresh);
    return { accessToken, refreshToken: newRefresh };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar sesión — invalida tokens' })
  @ApiResponse({ status: 204, description: 'Tokens invalidados correctamente' })
  async logout(
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
    @Headers('authorization') authorization: string,
  ) {
    const accessToken = authorization?.replace('Bearer ', '') ?? (req.cookies?.[ACCESS_COOKIE] as string);
    const refreshToken = (req.body as any)?.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string);
    await this.authService.logout(accessToken, refreshToken);
    clearAuthCookies(res);
  }

  @Public()
  @Get('verify-email/:token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar cuenta con token enviado por email' })
  @ApiResponse({ status: 200, description: 'Cuenta verificada' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  verifyEmail(@Param('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar recuperación de contraseña' })
  @ApiResponse({ status: 200, description: 'Instrucciones enviadas si el email existe' })
  forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('email-change/request')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Solicitar cambio de email — envía un código al nuevo correo' })
  @ApiResponse({ status: 200, description: 'Código enviado' })
  requestEmailChange(@CurrentUser('id') userId: string, @Body() dto: RequestEmailChangeDto) {
    return this.authService.requestEmailChange(userId, dto.newEmail);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('email-change/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirmar cambio de email con el código recibido' })
  @ApiResponse({ status: 200, description: 'Email actualizado, sesión invalidada' })
  confirmEmailChange(@CurrentUser('id') userId: string, @Body() dto: ConfirmEmailChangeDto) {
    return this.authService.confirmEmailChange(userId, dto.code);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reenviar enlace de verificación de cuenta' })
  @ApiResponse({ status: 200, description: 'Enlace reenviado si el email existe' })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar contraseña — requiere la contraseña actual' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada, sesión invalidada' })
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restablecer contraseña con token' })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada' })
  @ApiResponse({ status: 401, description: 'Token inválido o expirado' })
  resetPassword(@Body('token') token: string, @Body('newPassword') newPassword: string) {
    return this.authService.resetPassword(token, newPassword);
  }
}
