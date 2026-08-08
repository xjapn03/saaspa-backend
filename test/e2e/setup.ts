import { config } from 'dotenv';

// Carga .env.test ANTES de que NestJS/@nestjs/config lea .env.
// dotenv NO sobreescribe variables que ya existen en process.env,
// por lo que DATABASE_URL apunta a kamerinos_db_tests durante los E2E.
config({ path: '.env.test' });
