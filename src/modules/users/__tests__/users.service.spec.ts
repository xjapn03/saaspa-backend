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
