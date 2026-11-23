import type { z } from 'zod';
import type { importSchema } from './schema.js';

export enum ImportRowOutcome {
  Accepted = 'accepted',
  Rejected = 'rejected',
  InvalidPhone = 'invalid_phone',
  InvalidVerified = 'invalid_verified',
  NotFound = 'not_found',
  NoSingaporeNumber = 'no_singapore_number',
  AlreadyVerified = 'already_verified',
  AlreadyFailed = 'already_failed',
  DuplicateInFile = 'duplicate_in_file',
  ApprovalFailed = 'approval_failed',
}

export type ImportInput = z.infer<typeof importSchema>;

export interface ImportRowView {
  rowNumber: number;
  primaryPhone: string;
  verified: string;
  outcome: ImportRowOutcome;
  partnerId?: string;
}

export interface ImportCounts {
  rows: number;
  accepted: number;
  rejected: number;
  errors: number;
}

export interface VerifiedImportResult {
  importId: string;
  fileName: string;
  counts: ImportCounts;
  rows: ImportRowView[];
  createdAt: string;
}

export interface ImportRow {
  id: string;
  uploaded_by_admin_id: string;
  file_name: string;
  rows_total: number;
  rows_accepted: number;
  rows_rejected: number;
  rows_failed: number;
  created_at: string;
}

export interface ImportRowRecord {
  row_no: number;
  primary_phone_raw: string;
  verified_raw: string | null;
  outcome: ImportRowOutcome;
  partner_id: string | null;
}

export interface ImportEntry {
  raw: string;
  phone: string;
  verifiedRaw: string;
  verified?: boolean;
}
