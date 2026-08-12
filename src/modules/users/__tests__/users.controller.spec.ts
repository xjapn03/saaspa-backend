import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';
import { UpdateUserDto } from '../dto/update-user.dto';
import { Role } from '@prisma/client';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: DeepMockProxy<UsersService>;

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
    usersService = mockDeep<UsersService>();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();
    controller = module.get<UsersController>(UsersController);
  });

  describe('findAll', () => {
    it('should return list of active users', async () => {
      // Arrange
      usersService.findAll.mockResolvedValue({ data: [mockSafeUser], total: 1, page: 1, limit: 20, totalPages: 1 });

      // Act
      const result = await controller.findAll();

      // Assert
      expect(result.data).toHaveLength(1);
      expect(usersService.findAll).toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('should return own profile using token userId', async () => {
      // Arrange
      usersService.findById.mockResolvedValue(mockSafeUser);

      // Act
      const result = await controller.getProfile('user-1');

      // Assert
      expect(result.email).toBe('test@test.com');
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
    });
  });

  describe('updateProfile', () => {
    it('should update own profile and return updated data', async () => {
      // Arrange
      const dto: UpdateUserDto = { birthday: '1990-05-15', description: 'Updated' };
      usersService.update.mockResolvedValue({
        ...mockSafeUser,
        birthday: new Date('1990-05-15'),
        description: 'Updated',
      });

      // Act
      const result = await controller.updateProfile('user-1', dto);

      // Assert
      expect(result.description).toBe('Updated');
      expect(usersService.update).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('findOne', () => {
    it('should return user by ID', async () => {
      // Arrange
      usersService.findById.mockResolvedValue(mockSafeUser);

      // Act
      const result = await controller.findOne('user-1');

      // Assert
      expect(result.id).toBe('user-1');
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
    });
  });

  describe('update', () => {
    it('should update any user as admin', async () => {
      // Arrange
      const dto: UpdateUserDto = { role: 'ADMIN' };
      usersService.update.mockResolvedValue({ ...mockSafeUser, role: 'ADMIN' });

      // Act
      const result = await controller.update('user-1', dto);

      // Assert
      expect(result.role).toBe('ADMIN');
      expect(usersService.update).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('remove', () => {
    it('should soft-delete user as admin', async () => {
      // Arrange
      usersService.remove.mockResolvedValue({ ...mockSafeUser, isActive: false });

      // Act
      await controller.remove('user-1');

      // Assert
      expect(usersService.remove).toHaveBeenCalledWith('user-1');
    });
  });
});
