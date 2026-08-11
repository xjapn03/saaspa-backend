import { Controller, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Upload')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  @Post()
  @Roles(Role.ADMIN, Role.EMPLEADO)
  @ApiOperation({ summary: 'Subir imagen — Admin/Empleado' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, folder: { type: 'string', example: 'products' } } } })
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, file, cb) => {
        const folder = (_req as any).body?.folder || 'products';
        cb(null, join(process.cwd(), 'uploads', folder));
      },
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${unique}${extname(file.originalname)}`);
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
  uploadFile(@UploadedFile() file: any) {
    const url = `/uploads/${(file as any).destination.split('uploads/')[1]}/${file.filename}`;
    return { url, filename: file.filename, size: file.size, mimetype: file.mimetype };
  }
}
