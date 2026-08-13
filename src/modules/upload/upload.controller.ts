import { Controller, Post, Req, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';

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
    storage: diskStorage({
      destination: (_req, file, cb) => {
        const folder = normalizeFolder((_req as any).body?.folder);
        const dir = join(process.cwd(), 'uploads', folder);
        try {
          mkdirSync(dir, { recursive: true });
        } catch {
          // ignore, multer reportará el error si no puede escribir
        }
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const imageType = (_req as any).body?.imageType;
        const ext = extname(file.originalname).toLowerCase();
        if (imageType === 'main') {
          cb(null, `main${ext}`);
        } else {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `gallery-${unique}${ext}`);
        }
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.match(/^image\/(jpeg|png|gif|webp)$/)) {
        cb(new Error('Solo imágenes (JPEG, PNG, GIF, WEBP)'), false);
      } else {
        cb(null, true);
      }
    },
  }))
  uploadFile(@UploadedFile() file: any, @Req() req: any) {
    const folder = normalizeFolder(req.body?.folder);
    const url = `/uploads/${folder}/${file.filename}`;
    return { url, filename: file.filename, size: file.size, mimetype: file.mimetype };
  }
}
