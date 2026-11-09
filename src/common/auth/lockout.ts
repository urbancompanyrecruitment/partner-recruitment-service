import { AppError, ErrorCode } from '../errors/index.js';
import { dayjs } from '../time.js';
import { LOGIN_LOCKOUT_MINUTES, LOGIN_MAX_FAILURES } from './constant.js';
import type { LoginFailure } from './interface.js';

export const assertNotLocked = (lockedUntil: string | null): void => {
  if (!lockedUntil || !dayjs.utc(lockedUntil).isAfter(dayjs())) return;

  throw new AppError(ErrorCode.LoginLocked, { lockedUntil: dayjs.utc(lockedUntil).toISOString() });
};

export const nextLoginFailure = (failedLoginCount: number): LoginFailure => {
  const failedCount = failedLoginCount + 1;

  return {
    failedCount,
    lockedUntil: failedCount >= LOGIN_MAX_FAILURES ? dayjs().add(LOGIN_LOCKOUT_MINUTES, 'minute').toDate() : null,
  };
};
