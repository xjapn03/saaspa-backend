import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration';
import * as Joi from 'joi';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3001),
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        CORS_ORIGIN: Joi.string().default('http://localhost:3000'),
        // Service-to-service auth with saaspa-IA. Required on purpose: the app
        // must fail closed if any of these is missing.
        IA_BOT_API_KEY: Joi.string().required(),
        INTERNAL_API_KEY: Joi.string().required(),
        TURN_TOKEN_PRIVATE_KEY: Joi.string().required(),
        TURN_TOKEN_KID: Joi.string().required(),
        TENANT_ID: Joi.string().required(),
      }),
    }),
  ],
})
export class ConfigModule {}
