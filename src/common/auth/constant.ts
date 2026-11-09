import { ActorRole } from './interface.js';

export const SESSION_COOKIE: Record<ActorRole, string> = {
  [ActorRole.Partner]: 'partner_session',
  [ActorRole.Admin]: 'admin_session',
  [ActorRole.Recruiter]: 'recruiter_session',
};

const HOUR_SECONDS = 60 * 60;

const DAY_SECONDS = 24 * HOUR_SECONDS;

export const SESSION_MAX_AGE_SECONDS: Record<ActorRole, number> = {
  [ActorRole.Partner]: 30 * DAY_SECONDS,
  [ActorRole.Admin]: 12 * HOUR_SECONDS,
  [ActorRole.Recruiter]: 7 * DAY_SECONDS,
};

export const JWT_ALGORITHM = 'HS256';

export const COOKIE_PATH = '/';

export const LOGIN_MAX_FAILURES = 10;

export const LOGIN_LOCKOUT_MINUTES = 15;
