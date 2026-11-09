import { ERROR_MESSAGE, ERROR_STATUS } from './constant.js';
import { ErrorCode, type ErrorBody } from './interface.js';

export class AppError extends Error {
  readonly code: ErrorCode;

  readonly status: number;

  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, details?: Record<string, unknown>) {
    super(ERROR_MESSAGE[code]);
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }

  toBody(): ErrorBody {
    return { error: { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) } };
  }
}

export { ErrorCode } from './interface.js';
