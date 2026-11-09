import { z } from 'zod';
import {
  DEFAULT_ADMIN_EMAIL_DOMAINS,
  DEFAULT_LOCK_TTL_HOURS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_ONBOARDING_CATEGORY_KEY,
  DEFAULT_ONBOARDING_CITY_KEY,
  DEFAULT_ONBOARDING_CLIENT_ID,
  DEFAULT_ONBOARDING_SOURCE_TYPE,
  DEFAULT_PORT,
  DEFAULT_SLOT_CAPACITY,
  ENCRYPTION_KEY_HEX_LENGTH,
  LIST_SEPARATOR,
  MIN_SECRET_LENGTH,
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
  SESSION_SECRET: z.string().min(MIN_SECRET_LENGTH),
  PHONE_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]+$/i).length(ENCRYPTION_KEY_HEX_LENGTH),
  PHONE_CHECKSUM_KEY: z.string().min(MIN_SECRET_LENGTH),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform(value => value === 'true'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  ADMIN_EMAIL_DOMAINS: z.string().default(DEFAULT_ADMIN_EMAIL_DOMAINS),
  ONBOARDING_BASE_URL: optionalString,
  ONBOARDING_CLIENT_ID: z.string().default(DEFAULT_ONBOARDING_CLIENT_ID),
  ONBOARDING_CATEGORY_KEY: z.string().default(DEFAULT_ONBOARDING_CATEGORY_KEY),
  ONBOARDING_CITY_KEY: z.string().default(DEFAULT_ONBOARDING_CITY_KEY),
  ONBOARDING_SOURCE_TYPE: z.string().default(DEFAULT_ONBOARDING_SOURCE_TYPE),
  LOCK_TTL_HOURS: z.coerce.number().positive().default(DEFAULT_LOCK_TTL_HOURS),
  SLOT_CAPACITY: z.coerce.number().int().positive().default(DEFAULT_SLOT_CAPACITY),
});

export const loadConfig = (environment: NodeJS.ProcessEnv): Config => {
  const parsed = environmentSchema.parse(environment);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    sessionSecret: parsed.SESSION_SECRET,
    phoneEncryptionKey: Buffer.from(parsed.PHONE_ENCRYPTION_KEY, 'hex'),
    phoneChecksumKey: parsed.PHONE_CHECKSUM_KEY,
    cookieSecure: parsed.COOKIE_SECURE,
    googleClientId: parsed.GOOGLE_CLIENT_ID,
    adminEmailDomains: parsed.ADMIN_EMAIL_DOMAINS.split(LIST_SEPARATOR)
      .map(domain => domain.trim().toLowerCase())
      .filter(Boolean),
    onboarding: {
      baseUrl: parsed.ONBOARDING_BASE_URL,
      clientId: parsed.ONBOARDING_CLIENT_ID,
      categoryKey: parsed.ONBOARDING_CATEGORY_KEY,
      cityKey: parsed.ONBOARDING_CITY_KEY,
      sourceType: parsed.ONBOARDING_SOURCE_TYPE,
    },
    lockTtlHours: parsed.LOCK_TTL_HOURS,
    slotCapacity: parsed.SLOT_CAPACITY,
  };
};

export const config = loadConfig(process.env);
