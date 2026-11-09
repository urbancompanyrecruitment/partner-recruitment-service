import { ImportRowOutcome } from './interface.js';

export const MAX_IMPORT_ROWS = 5000;

export const FILE_NAME_MAX_LENGTH = 255;

export const RAW_PHONE_MAX_LENGTH = 32;

export const FAIL_CSV_HEADERS = ['row', 'primary_mobile', 'reason'];

export const IMPORT_OUTCOME_REASON: Record<ImportRowOutcome, string> = {
  [ImportRowOutcome.Accepted]: 'Verified and approved',
  [ImportRowOutcome.InvalidPhone]: 'Invalid phone number',
  [ImportRowOutcome.NotFound]: 'No sign-up with this primary mobile',
  [ImportRowOutcome.NoSingaporeNumber]: 'No Singapore number on file',
  [ImportRowOutcome.AlreadyVerified]: 'Already verified',
  [ImportRowOutcome.DuplicateInFile]: 'Duplicate row in file',
  [ImportRowOutcome.ApprovalFailed]: 'Approval in provider-onboarding-service failed',
};
