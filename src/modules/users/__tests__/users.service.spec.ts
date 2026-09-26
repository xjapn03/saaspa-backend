import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { UsersService } from '../users.service';
import { IUsersRepository } from '../../../repositories/interfaces/users.repository';
import { Role } from '@prisma/client';

describe('UsersService', () => {
  let service: UsersService;
  let repo: DeepMockProxy<IUsersRepository>;

  const mockSafeUser = {
    id: 'user-1',
    email: 'test@test.com',
    firstName: 'Test',
    lastName: 'User',
    phone: null,
    birthday: null,
    description: null,
    role: 'CLIENTE' as Role,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    repo = mockDeep<IUsersRepository>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: IUsersRepository, useValue: repo }],
    }).compile();
    service = module.get<UsersService>(UsersService);
  });

  describe('findAll', () => {
    it('should delegate to repository and return users', async () => {
      // Arrange
      repo.findAll.mockResolvedValue({ data: [mockSafeUser], total: 1, page: 1, limit: 20, totalPages: 1 });

      // Act
      const result = await service.findAll();

      // Assert
      expect(result.data).toHaveLength(1);
      expect(repo.findAll).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should delegate to repository and return user', async () => {
      // Arrange
      repo.findById.mockResolvedValue(mockSafeUser);

      // Act
      const result = await service.findById('user-1');

      // Assert
      expect(result.email).toBe('test@test.com');
      expect(repo.findById).toHaveBeenCalledWith('user-1');
    });
  });

  describe('findByEmail', () => {
    it('should delegate to repository and allow null', async () => {
      // Arrange
      repo.findByEmail.mockResolvedValue(null);

      // Act
      const result = await service.findByEmail('no@user.com');

      // Assert
      expect(result).toBeNull();
      expect(repo.findByEmail).toHaveBeenCalledWith('no@user.com');
    });
  });

  describe('update', () => {
    it('should delegate to repository and return updated user', async () => {
      // Arrange
      const updated = { ...mockSafeUser, firstName: 'Updated' };
      repo.update.mockResolvedValue(updated);

      // Act
      const result = await service.update('user-1', { firstName: 'Updated' });

      // Assert
      expect(result.firstName).toBe('Updated');
      expect(repo.update).toHaveBeenCalledWith('user-1', { firstName: 'Updated' });
    });

    it('converts a date-only birthday string to a Date before persisting', async () => {
      // Arrange
      repo.update.mockResolvedValue({ ...mockSafeUser, birthday: new Date('1990-05-15') });

      // Act
      await service.update('user-1', { birthday: '1990-05-15' });

      // Assert
      const [, data] = repo.update.mock.calls[0];
      expect(data.birthday).toBeInstanceOf(Date);
      expect((data.birthday as Date).toISOString()).toBe('1990-05-15T00:00:00.000Z');
    });

    it('converts a full ISO birthday string to a Date', async () => {
      // Arrange
      repo.update.mockResolvedValue({ ...mockSafeUser, birthday: new Date('1990-05-15T10:30:00.000Z') });

      // Act
      await service.update('user-1', { birthday: '1990-05-15T10:30:00.000Z' });

      // Assert
      const [, data] = repo.update.mock.calls[0];
      expect(data.birthday).toBeInstanceOf(Date);
      expect((data.birthday as Date).toISOString()).toBe('1990-05-15T10:30:00.000Z');
    });

    it('rejects an unparsable birthday with 400 without touching the repository', async () => {
      // Act + Assert
      await expect(service.update('user-1', { birthday: 'no-es-fecha' })).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('keeps the other fields and does not touch a null or missing birthday', async () => {
      // Arrange
      repo.update.mockResolvedValue({ ...mockSafeUser });

      // Act
      await service.update('user-1', { firstName: 'Updated', birthday: null });

      // Assert
      expect(repo.update).toHaveBeenCalledWith('user-1', { firstName: 'Updated', birthday: null });
    });
  });

  describe('remove', () => {
    it('should delegate to repository for soft delete', async () => {
      // Arrange
      repo.remove.mockResolvedValue({ ...mockSafeUser, isActive: false });

      // Act
      const result = await service.remove('user-1');

      // Assert
      expect(result.isActive).toBe(false);
      expect(repo.remove).toHaveBeenCalledWith('user-1');
    });
  });
});
