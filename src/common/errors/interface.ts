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
  ReferrerRequired = 'REFERRER_REQUIRED',
  InvalidCredentials = 'INVALID_CREDENTIALS',
  LoginLocked = 'LOGIN_LOCKED',
  NotAvailable = 'NOT_AVAILABLE',
  LockUnavailable = 'LOCK_UNAVAILABLE',
  LockExpired = 'LOCK_EXPIRED',
  NotLockOwner = 'NOT_LOCK_OWNER',
  InvalidStartDate = 'INVALID_START_DATE',
  InvalidTransition = 'INVALID_TRANSITION',
  LeadCreationFailed = 'LEAD_CREATION_FAILED',
  RecruiterSuspended = 'RECRUITER_SUSPENDED',
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
