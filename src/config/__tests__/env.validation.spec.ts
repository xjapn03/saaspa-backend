import * as Joi from 'joi';
import { DEFAULT_TIMEZONE } from '../../common/time/timezone.util';
import { DEFAULT_IA_BOT_TIMEOUT_MS } from '../../modules/chat/chat.constants';
import { envValidationSchema } from '../env.validation';

/**
 * Options `@nestjs/config` uses to validate the environment
 * (`ConfigModule.getSchemaValidationOptions`). When the schema fails, the
 * library aborts the bootstrap with `Config validation error: <message>`, so a
 * validation error here means the process does not start.
 */
const NEST_VALIDATION_OPTIONS: Joi.ValidationOptions = { abortEarly: false, allowUnknown: true };

/** Variables that were already mandatory before this change. */
const ALWAYS_REQUIRED: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/kamerinos',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'test-secret',
  IA_BOT_API_KEY: 'ia-key',
  INTERNAL_API_KEY: 'internal-key',
  TURN_TOKEN_PRIVATE_KEY: 'base64-private-key',
  TURN_TOKEN_KID: 'kid',
  TENANT_ID: 'kamerinos',
};

/** Values that a production deployment has to provide. */
const DEPLOYMENT_VALUES: Record<string, string> = {
  IA_BOT_URL: 'http://ia-bot:8000',
  IA_BOT_TIMEOUT_MS: '15000',
  TENANT_TIMEZONE: 'America/Bogota',
};

const DEPLOYMENT_KEYS = Object.keys(DEPLOYMENT_VALUES);

const validate = (env: Record<string, unknown>) =>
  envValidationSchema.validate(env, NEST_VALIDATION_OPTIONS);

const buildEnv = (overrides: Record<string, string> = {}): Record<string, string> => ({
  ...ALWAYS_REQUIRED,
  ...overrides,
});

describe('envValidationSchema', () => {
  describe('NODE_ENV=production', () => {
    it('accepts an environment that provides the three deployment values', () => {
      const { error, value } = validate(buildEnv({ NODE_ENV: 'production', ...DEPLOYMENT_VALUES }));

      expect(error).toBeUndefined();
      expect(value).toMatchObject(DEPLOYMENT_VALUES);
    });

    it.each(DEPLOYMENT_KEYS)('aborts the bootstrap when %s is missing', (missing) => {
      const env = buildEnv({ NODE_ENV: 'production', ...DEPLOYMENT_VALUES });
      delete env[missing];

      const { error } = validate(env);

      expect(error).toBeDefined();
      expect(error?.message).toContain(`"${missing}" is required`);
    });

    it('keeps aborting the bootstrap when a variable that was already required is missing', () => {
      const env = buildEnv({ NODE_ENV: 'production', ...DEPLOYMENT_VALUES });
      delete env.TENANT_ID;

      const { error } = validate(env);

      expect(error).toBeDefined();
      expect(error?.message).toContain('"TENANT_ID" is required');
    });
  });

  describe.each(['development', 'test'])('NODE_ENV=%s', (nodeEnv) => {
    it('starts without the three deployment values and applies the defaults', () => {
      const { error, value } = validate(buildEnv({ NODE_ENV: nodeEnv }));

      expect(error).toBeUndefined();
      expect(value).toMatchObject({
        IA_BOT_URL: 'http://localhost:8000',
        IA_BOT_TIMEOUT_MS: String(DEFAULT_IA_BOT_TIMEOUT_MS),
        TENANT_TIMEZONE: DEFAULT_TIMEZONE,
      });
    });

    it('keeps the deployment values the environment provides', () => {
      const { error, value } = validate(buildEnv({ NODE_ENV: nodeEnv, ...DEPLOYMENT_VALUES }));

      expect(error).toBeUndefined();
      expect(value).toMatchObject(DEPLOYMENT_VALUES);
    });
  });

  it('treats an absent NODE_ENV as development instead of production', () => {
    const { error, value } = validate(buildEnv());

    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      NODE_ENV: 'development',
      IA_BOT_URL: 'http://localhost:8000',
      TENANT_TIMEZONE: DEFAULT_TIMEZONE,
    });
  });

  it('ignores the unrelated variables the app loads from process.env', () => {
    const { error } = validate(
      buildEnv({ NODE_ENV: 'production', ...DEPLOYMENT_VALUES, WOMPI_PUBLIC_KEY: 'pub_test_x' }),
    );

    expect(error).toBeUndefined();
  });
});
