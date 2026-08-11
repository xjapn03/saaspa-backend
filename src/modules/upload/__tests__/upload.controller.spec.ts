import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { UploadController } from '../upload.controller';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';

describe('UploadController', () => {
  let controller: UploadController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        { provide: PrismaService, useValue: {} },
        { provide: RedisService, useValue: {} },
      ],
    }).compile();
    controller = module.get<UploadController>(UploadController);
  });

  it('should return file url on successful upload', () => {
    const mockFile = {
      filename: 'test-123.jpg',
      size: 1024,
      mimetype: 'image/jpeg',
      destination: '/app/uploads/products',
    };

    const result = controller.uploadFile(mockFile);

    expect(result.url).toBe('/uploads/products/test-123.jpg');
    expect(result.filename).toBe('test-123.jpg');
    expect(result.size).toBe(1024);
    expect(result.mimetype).toBe('image/jpeg');
  });

  it('should handle file from nested folder', () => {
    const mockFile = {
      filename: 'avatar.png',
      size: 2048,
      mimetype: 'image/png',
      destination: '/app/uploads/avatars',
    };

    const result = controller.uploadFile(mockFile);

    expect(result.url).toBe('/uploads/avatars/avatar.png');
  });
});
