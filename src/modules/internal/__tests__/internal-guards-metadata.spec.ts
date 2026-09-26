import { GUARDS_METADATA } from '@nestjs/common/constants';
import { THROTTLER_SKIP } from '@nestjs/throttler/dist/throttler.constants';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { InternalAuthGuard } from '../guards/internal-auth.guard';
import { InternalAvailabilityController } from '../internal-availability.controller';
import { InternalServicesController } from '../internal-services.controller';

/**
 * The internal routes must never lose two properties that are easy to drop in a
 * refactor: they have to skip the global throttler and they must be protected by
 * the dedicated guard (the @Public() flag only skips the user session guard).
 */
const CONTROLLERS = [InternalServicesController, InternalAvailabilityController] as const;

describe('Internal controllers metadata', () => {
  for (const controller of CONTROLLERS) {
    describe(controller.name, () => {
      it('is public for the session guard and skipped by the global throttler', () => {
        expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller)).toBe(true);
        expect(Reflect.getMetadata(`${THROTTLER_SKIP}default`, controller)).toBe(true);
      });

      it('is protected by InternalAuthGuard', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([InternalAuthGuard]);
      });
    });
  }
});
