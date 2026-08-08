import { execSync } from 'child_process';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let clientToken: string;

  beforeAll(async () => {
    // Aplica migraciones a la BD de tests (kamerinos_db_tests, ver setup.ts)
    execSync('npx prisma migrate deploy', { stdio: 'pipe' });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.$executeRawUnsafe('DELETE FROM "users" WHERE email != \'admin@kamerinosspa.com\'');

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@kamerinosspa.com', password: 'admin123' });
    adminToken = adminLogin.body.accessToken;

    await request(app.getHttpServer()).post('/api/auth/register').send({
      email: 'cliente@test.com',
      firstName: 'Cliente',
      lastName: 'Test',
      password: 'password123',
    });
    const clientLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'cliente@test.com', password: 'password123' });
    clientToken = clientLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/users/me', () => {
    it('should return own profile with admin token (200)', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${adminToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.email).toBe('admin@kamerinosspa.com');
      expect(response.body.role).toBe('ADMIN');
      expect(response.body.passwordHash).toBeUndefined();
    });

    it('should return own profile with client token (200)', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${clientToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.email).toBe('cliente@test.com');
      expect(response.body.role).toBe('CLIENTE');
    });

    it('should return 401 without token', async () => {
      // Act
      const response = await request(app.getHttpServer()).get('/api/users/me');

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/users/me', () => {
    it('should update own birthday and description (200)', async () => {
      // Arrange
      const body = {
        birthday: '1990-01-01',
        description: 'Actualizado desde E2E',
        phone: '3009998888',
      };

      // Act
      const response = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.description).toBe('Actualizado desde E2E');
      expect(response.body.phone).toBe('3009998888');
    });

    it('should return 400 with invalid fields', async () => {
      // Arrange
      const body = { birthday: 'not-a-date' };

      // Act
      const response = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body);

      // Assert
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/users', () => {
    it('should list all users as admin (200)', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
      response.body.forEach((user: any) => {
        expect(user.isActive).toBe(true);
        expect(user.passwordHash).toBeUndefined();
      });
    });

    it('should return 403 when client tries to list users', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${clientToken}`);

      // Assert
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/users/:id', () => {
    it('should return user by id as admin (200)', async () => {
      // Arrange — get the client user's ID from the list
      const listRes = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      const clientUser = listRes.body.find((u: any) => u.email === 'cliente@test.com');

      // Act
      const response = await request(app.getHttpServer())
        .get(`/api/users/${clientUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.email).toBe('cliente@test.com');
    });

    it('should return 404 for non-existent user', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/api/users/nonexistent-uuid')
        .set('Authorization', `Bearer ${adminToken}`);

      // Assert
      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/users/:id', () => {
    it('should update any user role as admin (200)', async () => {
      // Arrange — get the client user's ID
      const listRes = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      const clientUser = listRes.body.find((u: any) => u.email === 'cliente@test.com');

      // Act
      const response = await request(app.getHttpServer())
        .patch(`/api/users/${clientUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'EMPLEADO' });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.role).toBe('EMPLEADO');
    });

    it('should return 403 when client tries to update another user', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .patch('/api/users/some-id')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ firstName: 'Hack' });

      // Assert
      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should soft-delete user as admin (204)', async () => {
      // Arrange — get the client user's ID
      const listRes = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      const clientUser = listRes.body.find((u: any) => u.email === 'cliente@test.com');

      // Act
      const delResponse = await request(app.getHttpServer())
        .delete(`/api/users/${clientUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Assert
      expect(delResponse.status).toBe(204);

      // Verify user is no longer in active list
      const afterListRes = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      const deletedUser = afterListRes.body.find((u: any) => u.id === clientUser.id);
      expect(deletedUser).toBeUndefined();
    });

    it('should return 403 when client tries to delete a user', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .delete('/api/users/some-id')
        .set('Authorization', `Bearer ${clientToken}`);

      // Assert
      expect(response.status).toBe(403);
    });
  });
});
