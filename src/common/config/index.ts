import { z } from 'zod';
import {
  DEFAULT_DATABASE_POOL_MAX,
  DEFAULT_LOCK_TTL_HOURS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_ONBOARDING_CATEGORY_KEY,
  DEFAULT_ONBOARDING_CITY_KEY,
  DEFAULT_ONBOARDING_CLIENT_ID,
  DEFAULT_ONBOARDING_SOURCE_TYPE,
  DEFAULT_OPS_LEAD_UPLOAD_CITY_KEY,
  DEFAULT_OPS_LEAD_UPLOAD_EXPERIMENT_NAME,
  DEFAULT_OPS_LEAD_UPLOAD_SOURCE_TYPE,
  DEFAULT_PORT,
  ENCRYPTION_KEY_HEX_LENGTH,
  ESCAPED_NEWLINE,
  MIN_CRON_SECRET_LENGTH,
  MIN_SECRET_LENGTH,
  NEWLINE,
  OPS_LEAD_UPLOAD_EXPERIMENT_NAME_PATTERN,
  OPS_LEAD_UPLOAD_SOURCE_TYPES,
} from './constant.js';
import { NodeEnvironment, type Config } from './interface.js';

const optionalString = z
  .string()
  .optional()
  .transform(value => value?.trim() || undefined);

const environmentSchema = z.object({
  NODE_ENV: z.enum(NodeEnvironment).default(NodeEnvironment.Development),
  PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
  LOG_LEVEL: z.string().default(DEFAULT_LOG_LEVEL),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(DEFAULT_DATABASE_POOL_MAX),
  DATABASE_CA_CERT: optionalString.transform(value => value?.replaceAll(ESCAPED_NEWLINE, NEWLINE)),
  CRON_SECRET: optionalString.pipe(z.string().min(MIN_CRON_SECRET_LENGTH).optional()),
  SESSION_SECRET: z.string().min(MIN_SECRET_LENGTH),
  PHONE_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]+$/i).length(ENCRYPTION_KEY_HEX_LENGTH),
  PHONE_CHECKSUM_KEY: z.string().min(MIN_SECRET_LENGTH),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform(value => value === 'true'),
  ONBOARDING_BASE_URL: optionalString,
  ONBOARDING_CLIENT_ID: z.string().default(DEFAULT_ONBOARDING_CLIENT_ID),
  ONBOARDING_CATEGORY_KEY: z.string().default(DEFAULT_ONBOARDING_CATEGORY_KEY),
  ONBOARDING_CITY_KEY: z.string().default(DEFAULT_ONBOARDING_CITY_KEY),
  ONBOARDING_SOURCE_TYPE: z.string().default(DEFAULT_ONBOARDING_SOURCE_TYPE),
  SIGNUP_SHEET_WEBHOOK_URL: optionalString,
  SIGNUP_SHEET_WEBHOOK_SECRET: optionalString,
  OPS_LEAD_UPLOAD_CITY_KEY: z.string().min(1).default(DEFAULT_OPS_LEAD_UPLOAD_CITY_KEY),
  OPS_LEAD_UPLOAD_CATEGORY_KEY: optionalString,
  OPS_LEAD_UPLOAD_SOURCE_TYPE: z.enum(OPS_LEAD_UPLOAD_SOURCE_TYPES).default(DEFAULT_OPS_LEAD_UPLOAD_SOURCE_TYPE),
  OPS_LEAD_UPLOAD_EXPERIMENT_NAME: z
    .string()
    .regex(OPS_LEAD_UPLOAD_EXPERIMENT_NAME_PATTERN)
    .default(DEFAULT_OPS_LEAD_UPLOAD_EXPERIMENT_NAME),
  LOCK_TTL_HOURS: z.coerce.number().positive().default(DEFAULT_LOCK_TTL_HOURS),
});

export const loadConfig = (environment: NodeJS.ProcessEnv): Config => {
  const parsed = environmentSchema.parse(environment);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    databasePoolMax: parsed.DATABASE_POOL_MAX,
    databaseCaCert: parsed.DATABASE_CA_CERT,
    cronSecret: parsed.CRON_SECRET,
    sessionSecret: parsed.SESSION_SECRET,
    phoneEncryptionKey: Buffer.from(parsed.PHONE_ENCRYPTION_KEY, 'hex'),
    phoneChecksumKey: parsed.PHONE_CHECKSUM_KEY,
    cookieSecure: parsed.COOKIE_SECURE,
    onboarding: {
      baseUrl: parsed.ONBOARDING_BASE_URL,
      clientId: parsed.ONBOARDING_CLIENT_ID,
      categoryKey: parsed.ONBOARDING_CATEGORY_KEY,
      cityKey: parsed.ONBOARDING_CITY_KEY,
      sourceType: parsed.ONBOARDING_SOURCE_TYPE,
    },
    signupSheet: { webhookUrl: parsed.SIGNUP_SHEET_WEBHOOK_URL, secret: parsed.SIGNUP_SHEET_WEBHOOK_SECRET },
    opsLeadUpload: {
      cityKey: parsed.OPS_LEAD_UPLOAD_CITY_KEY,
      categoryKey: parsed.OPS_LEAD_UPLOAD_CATEGORY_KEY,
      sourceType: parsed.OPS_LEAD_UPLOAD_SOURCE_TYPE,
      experimentName: parsed.OPS_LEAD_UPLOAD_EXPERIMENT_NAME,
    },
    lockTtlHours: parsed.LOCK_TTL_HOURS,
  };
};

export const config = loadConfig(process.env);
