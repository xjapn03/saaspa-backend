import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { AuditInterceptor } from '../audit.interceptor';
import { AuditService } from '../audit.service';

describe('AuditInterceptor', () => {
  let audit: { record: jest.Mock };
  let interceptor: AuditInterceptor;

  const contextFor = (method: string, originalUrl: string, user?: { id: string; email: string }) =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method, originalUrl, ip: '10.0.0.7', user }),
      }),
    }) as unknown as ExecutionContext;

  const handler = (): CallHandler => ({ handle: () => of({ ok: true }) });

  const runWith = (context: ExecutionContext) =>
    lastValueFrom(interceptor.intercept(context, handler()));

  const record = () => audit.record.mock.calls[0][0];

  beforeEach(() => {
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    interceptor = new AuditInterceptor(audit as unknown as AuditService);
  });

  it('records a mutation with the actor, the resource and the ip', async () => {
    await runWith(
      contextFor('PATCH', '/api/bookings/b1/cancel', { id: 'u1', email: 'staff@test.com' }),
    );

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(record()).toEqual({
      actorId: 'u1',
      actorEmail: 'staff@test.com',
      action: 'PATCH',
      entity: 'bookings',
      entityId: 'b1',
      ip: '10.0.0.7',
    });
  });

  it('reads the id of a route that has a collection before it', async () => {
    await runWith(contextFor('PATCH', '/api/chat/conversations/c0ffee01/handoff'));

    expect(record()).toEqual(
      expect.objectContaining({ entity: 'chat', entityId: 'c0ffee01', action: 'PATCH' }),
    );
  });

  it('records no id when the path has no resource', async () => {
    await runWith(contextFor('POST', '/api/bookings/admin/sync-calendar'));

    expect(record()).toEqual(expect.objectContaining({ entity: 'bookings', entityId: undefined }));
  });

  it('ignores reads', async () => {
    await runWith(contextFor('GET', '/api/bookings/b1'));

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('records the query string out of the path', async () => {
    await runWith(contextFor('DELETE', '/api/users/u1?force=true'));

    expect(record()).toEqual(expect.objectContaining({ entity: 'users', entityId: 'u1' }));
  });
});
