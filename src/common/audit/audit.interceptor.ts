import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { AuditService } from './audit.service';

const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const SKIP_PREFIXES = ['/audit-logs'];

/**
 * Path segments that are sub-actions of an entity, never its id. An action that
 * is not in this list would be recorded as an entityId.
 */
const ACTION_SEGMENTS = [
  'confirm',
  'cancel',
  'complete',
  'reopen',
  'reschedule',
  'handoff',
  'sync-calendar',
  'request',
  'validate',
  'manual',
  'init',
  'init-cart',
  'merge',
  'status',
  'balance',
  'usages',
  'tree',
  'webhook',
  'public',
  'admin',
  'me',
  'items',
  'use',
];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request & { user?: any }>();
    const method = req.method?.toUpperCase();

    if (!MUTATION_METHODS.has(method)) {
      return next.handle();
    }

    const path = (req.originalUrl || req.url || '').split('?')[0];
    if (SKIP_PREFIXES.some((p) => path.startsWith(p))) {
      return next.handle();
    }

    const { entity, entityId } = this.extractEntity(path);
    const actorId = req.user?.id || null;
    const actorEmail = req.user?.email || null;

    return next.handle().pipe(
      tap({
        next: () => {
          this.audit
            .record({
              actorId,
              actorEmail,
              action: method,
              entity,
              entityId,
              ip: req.ip || null,
            })
            .catch(() => undefined);
        },
      }),
    );
  }

  private extractEntity(path: string): { entity: string; entityId?: string } {
    const segments = path.replace(/^\//, '').split('/').filter(Boolean);
    // strip global "api" prefix
    if (segments[0] === 'api') segments.shift();

    const entity = segments[0] || 'unknown';
    // The id is the last segment that is not a sub-action, so a route with a
    // collection in between still records the resource it acted on:
    //   bookings/<id>/cancel            -> entityId <id>
    //   chat/conversations/<id>/handoff -> entityId <id>
    //   bookings/admin/sync-calendar    -> no id
    const rest = segments.slice(1).filter((segment) => !ACTION_SEGMENTS.includes(segment));
    const entityId = rest.length > 0 ? rest[rest.length - 1] : undefined;

    return { entity, entityId };
  }
}
