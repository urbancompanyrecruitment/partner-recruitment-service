import type { z } from 'zod';
import type { hubImportSchema } from './schema.js';

export enum HubRowOutcome {
  Updated = 'updated',
  InvalidPhone = 'invalid_phone',
  MissingHub = 'missing_hub',
  DuplicateInFile = 'duplicate_in_file',
  NotFound = 'not_found',
  NotEligible = 'not_eligible',
}

export type HubImportInput = z.infer<typeof hubImportSchema>;

export interface HubRowView {
  rowNumber: number;
  primaryPhone: string;
  hubName: string;
  outcome: HubRowOutcome;
  partnerId?: string;
}

export interface HubImportResult {
  fileName: string;
  counts: { rows: number; updated: number; errors: number };
  rows: HubRowView[];
}

export interface HubEntry {
  raw: string;
  phone: string;
  hubName: string;
}
