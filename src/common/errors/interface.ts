export enum ErrorCode {
  ValidationFailed = 'VALIDATION_FAILED',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  NotFound = 'NOT_FOUND',
  PhoneAlreadyRegistered = 'PHONE_ALREADY_REGISTERED',
  EmailAlreadyRegistered = 'EMAIL_ALREADY_REGISTERED',
  InvalidPhone = 'INVALID_PHONE',
  InvalidSingaporePhone = 'INVALID_SINGAPORE_PHONE',
  WeakPassword = 'WEAK_PASSWORD',
  UnknownCity = 'UNKNOWN_CITY',
  SlotUnavailable = 'SLOT_UNAVAILABLE',
  NotReschedulable = 'NOT_RESCHEDULABLE',
  ReferrerRequired = 'REFERRER_REQUIRED',
  InvalidCredentials = 'INVALID_CREDENTIALS',
  LoginLocked = 'LOGIN_LOCKED',
  CurrentPasswordIncorrect = 'CURRENT_PASSWORD_INCORRECT',
  NotAvailable = 'NOT_AVAILABLE',
  LockUnavailable = 'LOCK_UNAVAILABLE',
  LockExpired = 'LOCK_EXPIRED',
  NotLockOwner = 'NOT_LOCK_OWNER',
  InvalidStartDate = 'INVALID_START_DATE',
  UnknownAggregator = 'UNKNOWN_AGGREGATOR',
  AggregatorAlreadyExists = 'AGGREGATOR_ALREADY_EXISTS',
  InvalidTransition = 'INVALID_TRANSITION',
  RecruiterSuspended = 'RECRUITER_SUSPENDED',
  RecruiterPendingApproval = 'RECRUITER_PENDING_APPROVAL',
  RecruiterRejected = 'RECRUITER_REJECTED',
  RecruiterNotActive = 'RECRUITER_NOT_ACTIVE',
  AdminSuspended = 'ADMIN_SUSPENDED',
  ResetLinkInvalid = 'RESET_LINK_INVALID',
  RequestRejected = 'REQUEST_REJECTED',
  InternalError = 'INTERNAL_ERROR',
}

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
