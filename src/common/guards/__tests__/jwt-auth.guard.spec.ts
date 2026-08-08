import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { TokenBlacklistService } from '../../redis/token-blacklist.service';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: DeepMockProxy<Reflector>;
  let tokenBlacklist: DeepMockProxy<TokenBlacklistService>;

  beforeEach(() => {
    reflector = mockDeep<Reflector>();
    tokenBlacklist = mockDeep<TokenBlacklistService>();
    guard = new JwtAuthGuard(reflector, tokenBlacklist);
  });

  function mockContextWithToken(token?: string): DeepMockProxy<ExecutionContext> {
    const context = mockDeep<ExecutionContext>();
    context.switchToHttp.mockReturnValue({
      getRequest: () => ({
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
      getResponse: () => ({}),
    } as any);
    return context;
  }

  it('should allow access when route is marked @Public()', async () => {
    // Arrange
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = mockContextWithToken('valid-token');

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('should delegate to parent AuthGuard when route is not public', async () => {
    // Arrange
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = mockContextWithToken('valid-token');
    tokenBlacklist.isBlacklisted.mockResolvedValue(false);

    const parentCanActivate = jest
      .spyOn(Object.getPrototypeOf(guard.constructor.prototype), 'canActivate')
      .mockResolvedValue(true);

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
    expect(parentCanActivate).toHaveBeenCalled();
    parentCanActivate.mockRestore();
  });

  it('should throw UnauthorizedException when token is blacklisted', async () => {
    // Arrange
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = mockContextWithToken('revoked-token');
    tokenBlacklist.isBlacklisted.mockResolvedValue(true);

    jest
      .spyOn(Object.getPrototypeOf(guard.constructor.prototype), 'canActivate')
      .mockResolvedValue(true);

    // Act & Assert
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(tokenBlacklist.isBlacklisted).toHaveBeenCalledWith('revoked-token');
    jest.restoreAllMocks();
  });

  it('should allow when token is valid and not blacklisted', async () => {
    // Arrange
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = mockContextWithToken('valid-token');
    tokenBlacklist.isBlacklisted.mockResolvedValue(false);

    jest
      .spyOn(Object.getPrototypeOf(guard.constructor.prototype), 'canActivate')
      .mockResolvedValue(true);

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
    expect(tokenBlacklist.isBlacklisted).toHaveBeenCalledWith('valid-token');
    jest.restoreAllMocks();
  });

  it('should block if parent rejects (no valid token)', async () => {
    // Arrange
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = mockContextWithToken();

    jest
      .spyOn(Object.getPrototypeOf(guard.constructor.prototype), 'canActivate')
      .mockResolvedValue(false);

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(false);
    jest.restoreAllMocks();
  });
});
