export const DEFAULT_PORT = 3006;

export const DEFAULT_LOG_LEVEL = 'info';

export const MIN_SECRET_LENGTH = 32;

export const MIN_CRON_SECRET_LENGTH = 16;

export const ENCRYPTION_KEY_HEX_LENGTH = 64;

export const DEFAULT_ONBOARDING_CLIENT_ID = 'partner-recruitment-service';

export const DEFAULT_ONBOARDING_CATEGORY_KEY = 'cleaning';

export const DEFAULT_ONBOARDING_CITY_KEY = 'singapore';

export const DEFAULT_ONBOARDING_SOURCE_TYPE = 'recruitment_portal';

export const DEFAULT_LOCK_TTL_HOURS = 72;

export const DEFAULT_DATABASE_POOL_MAX = 10;

export const ESCAPED_NEWLINE = '\\n';

export const NEWLINE = '\n';

export const DEFAULT_OPS_LEAD_UPLOAD_CITY_KEY = 'city_singapore_v2';

export const DEFAULT_OPS_LEAD_UPLOAD_SOURCE_TYPE = 'third_party';

export const DEFAULT_OPS_LEAD_UPLOAD_EXPERIMENT_NAME = 'sg_recruitment_portal';

export const OPS_LEAD_UPLOAD_SOURCE_TYPES = ['third_party', 'offline_activity'] as const;

export const OPS_LEAD_UPLOAD_EXPERIMENT_NAME_PATTERN = /^[a-z0-9_]+$/;
