import { execSync } from 'child_process';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "users" WHERE email != \'admin@sandrapinzonsaludybelleza.com.co\'');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user and return tokens (201)', async () => {
      // Arrange
      const body = {
        email: 'e2e@test.com',
        firstName: 'E2E',
        lastName: 'Test',
        password: 'password123',
        phone: '3001112233',
        birthday: '1995-03-10',
        description: 'E2E test user',
      };

      // Act
      const response = await request(app.getHttpServer()).post('/api/auth/register').send(body);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.user.email).toBe('e2e@test.com');
      expect(response.body.user.firstName).toBe('E2E');
      expect(response.body.user.role).toBe('CLIENTE');
      expect(response.body.user.passwordHash).toBeUndefined();
    });

    it('should return 401 when email already exists', async () => {
      // Arrange
      const body = {
        email: 'admin@sandrapinzonsaludybelleza.com.co',
        firstName: 'Dup',
        lastName: 'User',
        password: 'password123',
      };

      // Act
      const response = await request(app.getHttpServer()).post('/api/auth/register').send(body);

      // Assert
      expect(response.status).toBe(401);
    });

    it('should return 400 when required fields are missing', async () => {
      // Arrange
      const body = { email: 'bad@test.com' };

      // Act
      const response = await request(app.getHttpServer()).post('/api/auth/register').send(body);

      // Assert
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login admin (seed) and return tokens (200)', async () => {
      // Arrange
      const body = {
        email: 'admin@sandrapinzonsaludybelleza.com.co',
        password: 'admin123',
      };

      // Act
      const response = await request(app.getHttpServer()).post('/api/auth/login').send(body);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.user.email).toBe('admin@sandrapinzonsaludybelleza.com.co');
      expect(response.body.user.role).toBe('ADMIN');
    });

    it('should return 401 with wrong password', async () => {
      // Arrange
      const body = {
        email: 'admin@sandrapinzonsaludybelleza.com.co',
        password: 'wrongpassword',
      };

      // Act
      const response = await request(app.getHttpServer()).post('/api/auth/login').send(body);

      // Assert
      expect(response.status).toBe(401);
    });

    it('should return 401 with non-existent email', async () => {
      // Arrange
      const body = {
        email: 'ghost@test.com',
        password: 'password123',
      };

      // Act
      const response = await request(app.getHttpServer()).post('/api/auth/login').send(body);

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should rotate tokens with valid refresh token (200)', async () => {
      // Arrange — first login to get a valid refresh token
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@sandrapinzonsaludybelleza.com.co', password: 'admin123' });
      const refreshToken = loginRes.body.refreshToken;

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.accessToken).not.toBe(loginRes.body.accessToken);
    });

    it('should return 401 with invalid refresh token', async () => {
      // Arrange
      const body = { refreshToken: 'invalid-token' };

      // Act
      const response = await request(app.getHttpServer()).post('/api/auth/refresh').send(body);

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('Route protection', () => {
    it('should return 401 accessing protected route without token', async () => {
      // Act
      const response = await request(app.getHttpServer()).get('/api/users/me');

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout and revoke access token (204)', async () => {
      // Arrange — login to get tokens
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@sandrapinzonsaludybelleza.com.co', password: 'admin123' });
      const accessToken = loginRes.body.accessToken;
      const refreshToken = loginRes.body.refreshToken;

      // Act
      const logoutRes = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

      // Assert
      expect(logoutRes.status).toBe(204);
    });

    it('should return 401 using a revoked access token', async () => {
      // Arrange — login, then logout to revoke the access token
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@sandrapinzonsaludybelleza.com.co', password: 'admin123' });
      const accessToken = loginRes.body.accessToken;

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      // Act — try to use the revoked access token
      const response = await request(app.getHttpServer())
        .get('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      // Assert
      expect(response.status).toBe(401);
    });

    it('should return 401 refreshing with revoked refresh token', async () => {
      // Arrange — login, then logout with refresh token to revoke it
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@sandrapinzonsaludybelleza.com.co', password: 'admin123' });
      const accessToken = loginRes.body.accessToken;
      const refreshToken = loginRes.body.refreshToken;

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

      // Act — try to refresh with the revoked refresh token
      const response = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken });

      // Assert
      expect(response.status).toBe(401);
    });
  });
});
