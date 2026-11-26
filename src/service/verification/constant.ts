import { ImportRowOutcome } from './interface.js';

export const MAX_IMPORT_ROWS = 5000;

export const FILE_NAME_MAX_LENGTH = 255;

export const RAW_PHONE_MAX_LENGTH = 32;

export const RAW_VERIFIED_MAX_LENGTH = 16;

export const TRUE_VALUES = ['true', 'yes', 'y', '1', 'pass', 'passed'];

export const FALSE_VALUES = ['false', 'no', 'n', '0', 'fail', 'failed'];

export const PROCESSED_OUTCOMES: ImportRowOutcome[] = [ImportRowOutcome.Accepted, ImportRowOutcome.Rejected];

export const FAIL_CSV_HEADERS = ['row', 'primary_mobile', 'verified', 'reason'];

export const IMPORT_OUTCOME_REASON: Record<ImportRowOutcome, string> = {
  [ImportRowOutcome.Accepted]: 'Marked as verified',
  [ImportRowOutcome.Rejected]: 'Marked as verification failed',
  [ImportRowOutcome.InvalidPhone]: 'Invalid phone number',
  [ImportRowOutcome.InvalidVerified]: 'The verified column must be true or false',
  [ImportRowOutcome.NotFound]: 'No sign-up with this primary mobile',
  [ImportRowOutcome.NoSingaporeNumber]: 'No Singapore number on file',
  [ImportRowOutcome.AlreadyVerified]: 'Already verified',
  [ImportRowOutcome.AlreadyFailed]: 'Already marked as verification failed',
  [ImportRowOutcome.DuplicateInFile]: 'Duplicate row in file',
  [ImportRowOutcome.ApprovalFailed]: 'Lead approval failed',
};
