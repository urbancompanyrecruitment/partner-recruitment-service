import { PasswordResetAccountType } from './interface.js';

export const RESET_TOKEN_BYTES = 32;

export const RESET_TOKEN_FRAGMENT_KEY = 'token';

export const RESET_TOKEN_MAX_LENGTH = 128;

export const RESET_TOKEN_TTL_MINUTES = 30;

export const RESET_REQUESTS_PER_WINDOW = 3;

export const RESET_REQUEST_WINDOW_MINUTES = 15;

export const STALE_TOKEN_RETENTION_HOURS = 24;

export const RESET_TOKEN_HASH_ALGORITHM = 'sha256';

export const FORGOT_PASSWORD_RATE_LIMIT = { max: 5, timeWindow: '15 minutes' };

export const RESET_PASSWORD_RATE_LIMIT = { max: 10, timeWindow: '15 minutes' };

export const RESET_PAGE_PATH: Record<PasswordResetAccountType, string> = {
  [PasswordResetAccountType.Recruiter]: '/recruiter/reset-password',
  [PasswordResetAccountType.Admin]: '/admin/reset-password',
};

export const RESET_MAIL_APP_NAME = 'TalentLink';

export const RESET_MAIL_SUBJECT = `Reset your ${RESET_MAIL_APP_NAME} password`;
