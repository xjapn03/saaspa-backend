import 'reflect-metadata';

import { execSync } from 'child_process';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import { PrismaClient } from '@prisma/client';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  if (process.env.NODE_ENV !== 'test') {
    try {
      logger.log('Aplicando migraciones pendientes...');
      execSync('npx prisma migrate deploy', { stdio: 'pipe' });
      logger.log('Migraciones aplicadas.');
    } catch {
      logger.warn(
        'No se pudieron aplicar migraciones. ¿PostgreSQL está corriendo? La API inicia de todos modos.',
      );
    }
  }

  await runSeedIfEnabled(logger);

  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix(config.get<string>('API_PREFIX', 'api'));

  app.use(helmet());
  app.use(compression());

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', '*'),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (config.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Kamerinos SPA API')
      .setDescription(
        'Backend Core — Usuarios • Agendamiento • Pagos Wompi • Google Calendar • Meta CAPI',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  logger.log(`API corriendo en http://localhost:${port}`);
  logger.log(`Swagger en http://localhost:${port}/docs`);
}

async function runSeedIfEnabled(logger: Logger) {
  if (process.env.RUN_SEED !== 'true') {
    return;
  }

  const prisma = new PrismaClient();
  try {
    const adminExists = await prisma.user.findUnique({
      where: { email: 'admin@kamerinosspa.com' },
    });

    if (adminExists) {
      logger.log('RUN_SEED=true pero el admin ya existe. Seed innecesario.');
      return;
    }

    logger.log('RUN_SEED=true y no hay admin. Ejecutando seed...');
    execSync('npx ts-node prisma/seed.ts', { stdio: 'pipe' });
    logger.log('Seed ejecutado correctamente.');
  } catch (error) {
    logger.warn('No se pudo ejecutar el seed. Verifica la conexión a PostgreSQL.');
  } finally {
    await prisma.$disconnect();
  }
}

bootstrap();
