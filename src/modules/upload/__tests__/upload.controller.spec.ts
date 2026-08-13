import { Test, TestingModule } from '@nestjs/testing';
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
    };
    const mockReq = { query: { folder: 'products' } };

    const result = controller.uploadFile(mockFile, mockReq);

    expect(result.url).toBe('/uploads/products/test-123.jpg');
    expect(result.filename).toBe('test-123.jpg');
    expect(result.size).toBe(1024);
    expect(result.mimetype).toBe('image/jpeg');
  });

  it('should handle nested folder per product from query params', () => {
    const mockFile = {
      filename: 'main.jpg',
      size: 2048,
      mimetype: 'image/jpeg',
    };
    const mockReq = { query: { folder: 'products/crema-hidratante', imageType: 'main' } };

    const result = controller.uploadFile(mockFile, mockReq);

    expect(result.url).toBe('/uploads/products/crema-hidratante/main.jpg');
  });

  it('should fallback to body folder when query is not provided', () => {
    const mockFile = {
      filename: 'gallery-1.jpg',
      size: 1024,
      mimetype: 'image/jpeg',
    };
    const mockReq = { body: { folder: 'products/serum-vitamina-c' } };

    const result = controller.uploadFile(mockFile, mockReq);

    expect(result.url).toBe('/uploads/products/serum-vitamina-c/gallery-1.jpg');
  });

  it('should sanitize unsafe folder segments', () => {
    const mockFile = {
      filename: 'main.png',
      size: 512,
      mimetype: 'image/png',
    };
    const mockReq = { query: { folder: 'products/../../secreto' } };

    const result = controller.uploadFile(mockFile, mockReq);

    expect(result.url).toBe('/uploads/products/secreto/main.png');
  });

  it('should fallback to products folder when empty', () => {
    const mockFile = {
      filename: 'main.png',
      size: 512,
      mimetype: 'image/png',
    };
    const mockReq = { query: { folder: '' } };

    const result = controller.uploadFile(mockFile, mockReq);

    expect(result.url).toBe('/uploads/products/main.png');
  });
});
