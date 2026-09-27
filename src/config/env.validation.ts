import * as Joi from 'joi';
import { DEFAULT_TIMEZONE } from '../common/time/timezone.util';
import { DEFAULT_IA_BOT_TIMEOUT_MS } from '../modules/chat/chat.constants';
import {
  DEFAULT_MAX_PENDING_PER_USER,
  DEFAULT_PAYMENT_TTL_MINUTES,
} from '../modules/bookings/booking.constants';

/** Mirrors the `||` fallback of `configuration.ts` and `IaBotClient`. */
const DEFAULT_IA_BOT_URL = 'http://localhost:8000';

/**
 * A deployment value is mandatory in production, so a container that forgets to
 * inject it fails to boot instead of silently falling back to `localhost`, to a
 * guessed timeout or to a guessed time zone. Outside production the documented
 * default stays, so an incomplete `.env` keeps working locally.
 */
const deploymentValue = (fallback: string): Joi.StringSchema =>
  Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default(fallback),
  });

/**
 * Environment schema validated by `@nestjs/config` on startup. A failure here
 * aborts the bootstrap with `Config validation error: ...`. The library
 * validates with `{ abortEarly: false, allowUnknown: true }` and writes the
 * result back into `process.env`, so the defaults below are visible both through
 * `ConfigService` and through the `configuration.ts` factory.
 */
export const envValidationSchema = Joi.object({
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
  // Deployment values of the chat and availability integration: required in
  // production for the same fail-closed reason, optional elsewhere. Values stay
  // strings: the consumers parse them (`IA_BOT_TIMEOUT_MS`) or use them as-is
  // (`IA_BOT_URL`, `TENANT_TIMEZONE`).
  IA_BOT_URL: deploymentValue(DEFAULT_IA_BOT_URL),
  IA_BOT_TIMEOUT_MS: deploymentValue(String(DEFAULT_IA_BOT_TIMEOUT_MS)),
  TENANT_TIMEZONE: deploymentValue(DEFAULT_TIMEZONE),
  // Booking policy. Optional with documented defaults: operations can tune the
  // payment window or the pending bookings cap without a deploy, but a missing
  // value is not a deployment error (unlike the chat integration above).
  BOOKING_PAYMENT_TTL_MINUTES: Joi.number().integer().min(1).default(DEFAULT_PAYMENT_TTL_MINUTES),
  BOOKING_MAX_PENDING_PER_USER: Joi.number().integer().min(1).default(DEFAULT_MAX_PENDING_PER_USER),
});
