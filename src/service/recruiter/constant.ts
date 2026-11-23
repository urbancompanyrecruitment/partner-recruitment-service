import { ErrorCode } from '../../common/errors/index.js';
import { RecruiterStatus } from './interface.js';

export const EMAIL_MAX_LENGTH = 190;

export const NAME_MAX_LENGTH = 120;

export const RECRUITER_LOGIN_RATE_LIMIT = { max: 10, timeWindow: '10 minutes' };

export const RECRUITER_SIGN_UP_RATE_LIMIT = { max: 5, timeWindow: '10 minutes' };

export const RECRUITER_STATUS_TRANSITIONS: Record<RecruiterStatus, RecruiterStatus[]> = {
  [RecruiterStatus.Pending]: [RecruiterStatus.Active, RecruiterStatus.Rejected],
  [RecruiterStatus.Active]: [RecruiterStatus.Suspended],
  [RecruiterStatus.Suspended]: [RecruiterStatus.Active],
  [RecruiterStatus.Rejected]: [RecruiterStatus.Active],
};

export const REVIEWED_FROM_STATUSES: RecruiterStatus[] = [RecruiterStatus.Pending, RecruiterStatus.Rejected];

export const BLOCKED_STATUS_ERROR: Partial<Record<RecruiterStatus, ErrorCode>> = {
  [RecruiterStatus.Suspended]: ErrorCode.RecruiterSuspended,
  [RecruiterStatus.Rejected]: ErrorCode.RecruiterRejected,
};
