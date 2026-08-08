import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { JwtAuthGuard } from '../jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: DeepMockProxy<Reflector>;

  beforeEach(() => {
    reflector = mockDeep<Reflector>();
    guard = new JwtAuthGuard(reflector);
  });

  it('should allow access when route is marked @Public()', () => {
    // Arrange
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = mockDeep<ExecutionContext>();

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('should delegate to parent AuthGuard when route is not public', () => {
    // Arrange
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = mockDeep<ExecutionContext>();

    const parentCanActivate = jest
      .spyOn(Object.getPrototypeOf(guard.constructor.prototype), 'canActivate')
      .mockReturnValue(true);

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
    expect(parentCanActivate).toHaveBeenCalled();

    parentCanActivate.mockRestore();
  });

  it('should block if parent rejects (no valid token)', () => {
    // Arrange
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = mockDeep<ExecutionContext>();

    jest
      .spyOn(Object.getPrototypeOf(guard.constructor.prototype), 'canActivate')
      .mockReturnValue(false);

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(false);

    jest.restoreAllMocks();
  });
});
