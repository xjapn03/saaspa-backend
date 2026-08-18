import { Controller, Post, Req, BadRequestException, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { join } from 'path';
import { mkdirSync, statSync } from 'fs';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import * as sharpNS from 'sharp';

type SharpFactory = (input: sharpNS.SharpInput, options?: sharpNS.SharpOptions) => sharpNS.Sharp;
const sharp = sharpNS as unknown as SharpFactory;

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 80;
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeFolder(raw: unknown): string {
  const value = String(raw || 'products').trim();
  if (!value) return 'products';
  const segments = value
    .split(/[/\\]/)
    .map(sanitizeSegment)
    .filter((s) => s.length > 0);
  return segments.join('/') || 'products';
}

function extractFolder(req: any): string {
  const raw = req?.query?.folder ?? req?.body?.folder;
  return normalizeFolder(raw);
}

function extractImageType(req: any): string | undefined {
  const value = req?.query?.imageType ?? req?.body?.imageType;
  return value ? String(value) : undefined;
}

function generateFilename(imageType: string | undefined): string {
  if (imageType === 'main') {
    return `main.webp`;
  }
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `gallery-${unique}.webp`;
}

@ApiTags('Upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  @Post()
  @Roles(Role.ADMIN, Role.EMPLEADO)
  @ApiOperation({ summary: 'Subir imagen — Admin/Empleado' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: { type: 'string', example: 'products/mi-producto' },
        imageType: { type: 'string', enum: ['main', 'gallery'], example: 'main' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_SIZE },
    fileFilter: (_req, file, cb) => {
      cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype));
    },
  }))
  async uploadFile(@UploadedFile() file: any, @Req() req: any) {
    if (!file) {
      throw new BadRequestException('Solo imágenes (JPEG, PNG, WEBP)');
    }

    const folder = extractFolder(req);
    const imageType = extractImageType(req);
    const filename = generateFilename(imageType);
    const dir = join(process.cwd(), 'uploads', folder);
    mkdirSync(dir, { recursive: true });

    const outputPath = join(dir, filename);
    try {
      await sharp(file.buffer)
        .rotate()
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(outputPath);
    } catch {
      throw new BadRequestException('No se pudo procesar la imagen. Verifica que sea una imagen válida.');
    }

    const { size } = statSync(outputPath);
    const url = `/uploads/${folder}/${filename}`;
    return { url, filename, size, mimetype: 'image/webp' };
  }
}
