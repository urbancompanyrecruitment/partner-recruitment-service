import { z } from 'zod';
import {
  DEFAULT_DATABASE_POOL_MAX,
  DEFAULT_FORGOT_PASSWORD_RESPONSE_MS,
  DEFAULT_LOCK_TTL_HOURS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_OPS_LEAD_UPLOAD_CATEGORY_KEY,
  DEFAULT_OPS_LEAD_UPLOAD_CITY_KEY,
  DEFAULT_OPS_LEAD_UPLOAD_EXPERIMENT_NAME,
  DEFAULT_OPS_LEAD_UPLOAD_SOURCE_TYPE,
  DEFAULT_PORT,
  DEFAULT_SMTP_PORT,
  ENCRYPTION_KEY_HEX_LENGTH,
  ESCAPED_NEWLINE,
  HTTPS_PREFIX,
  MIN_CRON_SECRET_LENGTH,
  MIN_SECRET_LENGTH,
  NEWLINE,
  TRAILING_SLASHES,
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
  SIGNUP_SHEET_WEBHOOK_URL: optionalString,
  SIGNUP_SHEET_WEBHOOK_SECRET: optionalString,
  OPS_LEAD_UPLOAD_CITY_KEY: z.string().min(1).default(DEFAULT_OPS_LEAD_UPLOAD_CITY_KEY),
  OPS_LEAD_UPLOAD_CATEGORY_KEY: optionalString.transform(value => value ?? DEFAULT_OPS_LEAD_UPLOAD_CATEGORY_KEY),
  OPS_LEAD_UPLOAD_SOURCE_TYPE: z.enum(OPS_LEAD_UPLOAD_SOURCE_TYPES).default(DEFAULT_OPS_LEAD_UPLOAD_SOURCE_TYPE),
  OPS_LEAD_UPLOAD_EXPERIMENT_NAME: z
    .string()
    .regex(OPS_LEAD_UPLOAD_EXPERIMENT_NAME_PATTERN)
    .default(DEFAULT_OPS_LEAD_UPLOAD_EXPERIMENT_NAME),
  LOCK_TTL_HOURS: z.coerce.number().positive().default(DEFAULT_LOCK_TTL_HOURS),
  PORTAL_BASE_URL: optionalString.pipe(z.url().optional()).transform(value => value?.replace(TRAILING_SLASHES, '')),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(DEFAULT_SMTP_PORT),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform(value => value === 'true'),
  SMTP_REQUIRE_TLS: z
    .enum(['true', 'false'])
    .default('true')
    .transform(value => value === 'true'),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  MAIL_FROM: optionalString,
  FORGOT_PASSWORD_RESPONSE_MS: z.coerce.number().int().positive().default(DEFAULT_FORGOT_PASSWORD_RESPONSE_MS),
});

export const loadConfig = (environment: NodeJS.ProcessEnv): Config => {
  const parsed = environmentSchema.parse(environment);

  if (parsed.NODE_ENV === NodeEnvironment.Production && parsed.PORTAL_BASE_URL && !parsed.PORTAL_BASE_URL.startsWith(HTTPS_PREFIX)) {
    throw new Error('PORTAL_BASE_URL must start with https:// in production, because reset links carry a password-reset token');
  }

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
    signupSheet: { webhookUrl: parsed.SIGNUP_SHEET_WEBHOOK_URL, secret: parsed.SIGNUP_SHEET_WEBHOOK_SECRET },
    opsLeadUpload: {
      cityKey: parsed.OPS_LEAD_UPLOAD_CITY_KEY,
      categoryKey: parsed.OPS_LEAD_UPLOAD_CATEGORY_KEY,
      sourceType: parsed.OPS_LEAD_UPLOAD_SOURCE_TYPE,
      experimentName: parsed.OPS_LEAD_UPLOAD_EXPERIMENT_NAME,
    },
    lockTtlHours: parsed.LOCK_TTL_HOURS,
    portalBaseUrl: parsed.PORTAL_BASE_URL,
    mail: {
      host: parsed.SMTP_HOST,
      port: parsed.SMTP_PORT,
      secure: parsed.SMTP_SECURE,
      requireTls: parsed.SMTP_REQUIRE_TLS,
      user: parsed.SMTP_USER,
      password: parsed.SMTP_PASSWORD,
      from: parsed.MAIL_FROM,
    },
    forgotPasswordResponseMs: parsed.FORGOT_PASSWORD_RESPONSE_MS,
  };
};

export const config = loadConfig(process.env);
