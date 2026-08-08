import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Role } from '@prisma/client';
import { RolesGuard } from '../roles.guard';
import { ROLES_KEY } from '../../decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: DeepMockProxy<Reflector>;

  beforeEach(() => {
    reflector = mockDeep<Reflector>();
    guard = new RolesGuard(reflector);
  });

  function createMockContext(user?: { id: string; email: string; role: string }) {
    const context = mockDeep<ExecutionContext>();
    context.switchToHttp.mockReturnValue({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
    } as any);
    return context;
  }

  it('should allow when no roles are required', () => {
    // Arrange
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext();

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('should allow when user has required role', () => {
    // Arrange
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const context = createMockContext({
      id: 'user-1',
      email: 'admin@test.com',
      role: 'ADMIN',
    });

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('should block when user does not have required role', () => {
    // Arrange
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const context = createMockContext({
      id: 'user-1',
      email: 'cliente@test.com',
      role: 'CLIENTE',
    });

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(false);
  });

  it('should block when user has no role at all', () => {
    // Arrange
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const context = createMockContext(undefined);

    // Act
    const result = guard.canActivate(context);

    // Assert
    expect(result).toBe(false);
  });
});
