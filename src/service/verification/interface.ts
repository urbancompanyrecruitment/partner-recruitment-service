import type { RowDataPacket } from 'mysql2/promise';
import type { z } from 'zod';
import type { importSchema } from './schema.js';

export enum ImportRowOutcome {
  Accepted = 'accepted',
  InvalidPhone = 'invalid_phone',
  NotFound = 'not_found',
  NoSingaporeNumber = 'no_singapore_number',
  AlreadyVerified = 'already_verified',
  DuplicateInFile = 'duplicate_in_file',
  ApprovalFailed = 'approval_failed',
}

export type ImportInput = z.infer<typeof importSchema>;

export interface ImportRowView {
  rowNumber: number;
  primaryPhone: string;
  outcome: ImportRowOutcome;
  partnerId?: string;
}

export interface ImportCounts {
  rows: number;
  accepted: number;
  failed: number;
}

export interface VerifiedImportResult {
  importId: string;
  fileName: string;
  counts: ImportCounts;
  rows: ImportRowView[];
  createdAt: string;
}

export interface ImportRow extends RowDataPacket {
  id: string;
  uploaded_by_admin_id: string;
  file_name: string;
  rows_total: number;
  rows_accepted: number;
  rows_failed: number;
  created_at: string;
}

export interface ImportRowRecord extends RowDataPacket {
  row_no: number;
  primary_phone_raw: string;
  outcome: ImportRowOutcome;
  partner_id: string | null;
}

export interface PhoneEntry {
  raw: string;
  phone: string;
}
