import { Test, TestingModule } from '@nestjs/testing';
import { UploadController } from '../upload.controller';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import * as sharp from 'sharp';

jest.mock('sharp', () => jest.fn().mockReturnValue({
  rotate: jest.fn().mockReturnThis(),
  resize: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  toFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    statSync: jest.fn(() => ({ size: 4096 })),
  };
});

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
    jest.clearAllMocks();
  });

  it('should return a webp url for a main image', async () => {
    const mockFile = { buffer: Buffer.from('fake'), size: 2048, mimetype: 'image/jpeg' };
    const mockReq = { query: { folder: 'products/crema-hidratante', imageType: 'main' } };

    const result = await controller.uploadFile(mockFile, mockReq);

    expect(sharp).toHaveBeenCalledWith(mockFile.buffer);
    expect(result.url).toBe('/uploads/products/crema-hidratante/main.webp');
    expect(result.filename).toBe('main.webp');
    expect(result.mimetype).toBe('image/webp');
    expect(result.size).toBe(4096);
  });

  it('should generate a unique gallery webp filename', async () => {
    const mockFile = { buffer: Buffer.from('fake'), size: 1024, mimetype: 'image/png' };
    const mockReq = { query: { folder: 'products/serum-vitamina-c', imageType: 'gallery' } };

    const result = await controller.uploadFile(mockFile, mockReq);

    expect(result.filename).toMatch(/^gallery-\d+-\d+\.webp$/);
    expect(result.url).toBe(`/uploads/products/serum-vitamina-c/${result.filename}`);
  });

  it('should fallback to products folder when empty', async () => {
    const mockFile = { buffer: Buffer.from('fake'), size: 512, mimetype: 'image/webp' };
    const mockReq = { query: { folder: '' } };

    const result = await controller.uploadFile(mockFile, mockReq);

    expect(result.url).toMatch(/^\/uploads\/products\/gallery-\d+-\d+\.webp$/);
  });

  it('should sanitize unsafe folder segments', async () => {
    const mockFile = { buffer: Buffer.from('fake'), size: 512, mimetype: 'image/jpeg' };
    const mockReq = { query: { folder: 'products/../../secreto' } };

    const result = await controller.uploadFile(mockFile, mockReq);

    expect(result.url).toBe(`/uploads/products/secreto/${result.filename}`);
  });

  it('should throw BadRequestException when no file is provided', async () => {
    const mockReq = { query: { folder: 'products' } };

    await expect(controller.uploadFile(undefined as any, mockReq)).rejects.toThrow('Solo imágenes (JPEG, PNG, WEBP)');
  });
});
