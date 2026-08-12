import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<AuditService>(AuditService);
  });

  describe('record', () => {
    it('should create an audit log entry', async () => {
      prisma.auditLog.create.mockResolvedValue({ id: 'a1' } as any);

      await service.record({ actorId: 'user-1', actorEmail: 'a@b.com', action: 'PATCH', entity: 'users', entityId: 'user-2', ip: '::1' });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ entity: 'users', action: 'PATCH' }) }),
      );
    });

    it('should swallow errors gracefully', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('db down'));

      await expect(service.record({ action: 'POST', entity: 'services' })).resolves.toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return paginated audit logs', async () => {
      prisma.auditLog.findMany.mockResolvedValue([{ id: 'a1', action: 'PATCH', entity: 'users', entityId: 'u1', actorId: null, actorEmail: null, ip: null, createdAt: new Date() }] as any);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
