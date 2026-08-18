import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../../database/prisma.service';
import { BannersService } from '../banners.service';

describe('BannersService', () => {
  let service: BannersService;
  let prisma: DeepMockProxy<PrismaService>;

  const mockBanner = {
    id: 'bnr-1',
    title: 'Halloween',
    subtitle: 'Promo',
    imageUrl: '/uploads/banners/x/main.webp',
    ctaText: null,
    ctaLink: null,
    position: 'HERO',
    isActive: true,
    sortOrder: 0,
    startsAt: null,
    endsAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [BannersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<BannersService>(BannersService);
  });

  it('findAll should return banners ordered', async () => {
    prisma.banner.findMany.mockResolvedValue([mockBanner] as any);
    const result = await service.findAll();
    expect(result).toHaveLength(1);
    expect(prisma.banner.findMany).toHaveBeenCalled();
  });

  it('findPublic should filter active and position', async () => {
    prisma.banner.findMany.mockResolvedValue([mockBanner] as any);
    await service.findPublic('HERO');
    expect(prisma.banner.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true, position: 'HERO' }) }),
    );
  });

  it('should auto-deactivate banners whose endsAt already passed', async () => {
    prisma.banner.findMany.mockResolvedValue([] as any);
    await service.findAll();
    expect(prisma.banner.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, endsAt: { lt: expect.any(Date) } }),
        data: { isActive: false },
      }),
    );
  });

  it('findPublic should also auto-deactivate expired banners', async () => {
    prisma.banner.findMany.mockResolvedValue([] as any);
    await service.findPublic('STRIP');
    expect(prisma.banner.updateMany).toHaveBeenCalled();
  });

  it('findById should throw when not found', async () => {
    prisma.banner.findUnique.mockResolvedValue(null);
    await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
  });
});
