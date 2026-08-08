import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../database/prisma.service';
import { UsersRepository } from '../users.repository';
import { Role } from '@prisma/client';

describe('UsersRepository', () => {
  let repo: UsersRepository;
  let prisma: DeepMockProxy<PrismaService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@test.com',
    passwordHash: 'hashed',
    firstName: 'Test',
    lastName: 'User',
    phone: '3001234567',
    birthday: new Date('1990-05-15'),
    description: null,
    role: 'CLIENTE' as Role,
    isActive: true,
    refreshToken: 'refresh-token-abc',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = module.get<UsersRepository>(UsersRepository);
  });

  describe('findAll', () => {
    it('should return only active users without passwordHash or refreshToken', async () => {
      // Arrange
      prisma.user.findMany.mockResolvedValue([mockUser] as any);

      // Act
      const result = await repo.findAll();

      // Assert
      expect(result).toHaveLength(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        select: expect.objectContaining({ email: true }),
      });
    });
  });

  describe('findById', () => {
    it('should return user without sensitive fields when found', async () => {
      // Arrange
      prisma.user.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await repo.findById('user-1');

      // Assert
      expect(result.id).toBe('user-1');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      prisma.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(repo.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('should return full user when found', async () => {
      // Arrange
      prisma.user.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await repo.findByEmail('test@test.com');

      // Assert
      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@test.com' },
      });
    });

    it('should return null when not found', async () => {
      // Arrange
      prisma.user.findUnique.mockResolvedValue(null);

      // Act
      const result = await repo.findByEmail('no@user.com');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByIdWithCredentials', () => {
    it('should return full user including passwordHash when found', async () => {
      // Arrange
      prisma.user.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await repo.findByIdWithCredentials('user-1');

      // Assert
      expect(result).toEqual(mockUser);
      expect(result?.passwordHash).toBe('hashed');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      prisma.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(repo.findByIdWithCredentials('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create and return full user', async () => {
      // Arrange
      const createData = {
        email: 'new@test.com',
        passwordHash: 'hashed',
        firstName: 'New',
        lastName: 'User',
      };
      prisma.user.create.mockResolvedValue({ ...mockUser, ...createData });

      // Act
      const result = await repo.create(createData as any);

      // Assert
      expect(result.email).toBe('new@test.com');
      expect(prisma.user.create).toHaveBeenCalledWith({ data: createData });
    });
  });

  describe('update', () => {
    it('should update and return user without sensitive fields', async () => {
      // Arrange
      const updateData = { firstName: 'Updated' };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, ...updateData } as any);

      // Act
      const result = await repo.update('user-1', updateData);

      // Assert
      expect(result.firstName).toBe('Updated');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: updateData,
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      // Arrange
      prisma.user.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(repo.update('nonexistent', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft-delete user (set isActive = false)', async () => {
      // Arrange
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, isActive: false } as any);

      // Act
      const result = await repo.remove('user-1');

      // Assert
      expect(result.isActive).toBe(false);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isActive: false },
        select: expect.any(Object),
      });
    });
  });

  describe('setRefreshToken', () => {
    it('should update and return user with new refresh token', async () => {
      // Arrange
      const newToken = 'new-refresh-token';
      prisma.user.update.mockResolvedValue({ ...mockUser, refreshToken: newToken });

      // Act
      const result = await repo.setRefreshToken('user-1', newToken);

      // Assert
      expect(result.refreshToken).toBe(newToken);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshToken: newToken },
      });
    });
  });
});
