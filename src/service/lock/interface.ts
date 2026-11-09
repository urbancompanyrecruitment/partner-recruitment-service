import type { RowDataPacket } from 'mysql2/promise';
import type { z } from 'zod';
import type { PartnerView } from '../partner/interface.js';
import type { placementSchema } from './schema.js';

export enum LockState {
  Active = 'active',
  Inactive = 'inactive',
}

export enum InactiveReason {
  Expired = 'expired',
  Placed = 'placed',
  Released = 'released',
}

export type PlacementInput = z.infer<typeof placementSchema>;

export interface LockRow extends RowDataPacket {
  id: string;
  partner_id: string;
  locked_by: string;
  locked_at: string;
  lock_release_at: string;
  state: LockState;
  inactive_reason: InactiveReason | null;
  inactive_at: string | null;
  employer_name: string | null;
  start_date: string | null;
  placement_recorded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminLockRow extends LockRow {
  partner_name: string;
  recruiter_name: string;
  recruiter_company: string;
}

export interface LockView {
  id: string;
  partnerId: string;
  recruiterId: string;
  lockedAt: string;
  lockReleaseAt: string;
  state: LockState;
  inactiveReason?: InactiveReason;
  inactiveAt?: string;
  employerName?: string;
  startDate?: string;
  placementRecordedAt?: string;
}

export interface AdminLockView extends LockView {
  partnerName: string;
  recruiterName: string;
  recruiterCompany: string;
}

export interface LockedPartner {
  lock: LockView;
  partner: PartnerView;
}

export interface AvailablePartnerFilters {
  country?: string;
}

export interface NewLock {
  id: string;
  partnerId: string;
  recruiterId: string;
  lockedAt: Date;
  lockReleaseAt: Date;
}

export interface ExpiredLocksResult {
  deactivated: number;
}
