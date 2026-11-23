import type { z } from 'zod';
import type { PartnerView, TransitionActor } from '../partner/interface.js';
import type { assignRecruiterSchema, placementSchema } from './schema.js';

export enum LockState {
  Active = 'active',
  Inactive = 'inactive',
}

export enum InactiveReason {
  Expired = 'expired',
  Placed = 'placed',
  Released = 'released',
}

export enum LockOrigin {
  Recruiter = 'recruiter',
  Registration = 'registration',
  Admin = 'admin',
}

export type PlacementInput = z.infer<typeof placementSchema>;

export type AssignRecruiterInput = z.infer<typeof assignRecruiterSchema>;

export interface LockRow {
  id: string;
  partner_id: string;
  locked_by: string;
  origin: LockOrigin;
  assigned_by_admin_id: string | null;
  locked_at: string;
  lock_release_at: string | null;
  state: LockState;
  inactive_reason: InactiveReason | null;
  inactive_at: string | null;
  employer_name: string | null;
  aggregator_id: string | null;
  start_date: string | null;
  placement_recorded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HeldLockRow extends LockRow {
  locked_by_email: string;
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
  origin: LockOrigin;
  lockedAt: string;
  lockReleaseAt?: string;
  state: LockState;
  inactiveReason?: InactiveReason;
  inactiveAt?: string;
  employerName?: string;
  aggregatorId?: string;
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

export interface LockRequest {
  partnerId: string;
  recruiterId: string;
  origin: LockOrigin;
  expires: boolean;
  actor: TransitionActor;
}

export interface NewLock {
  id: string;
  partnerId: string;
  recruiterId: string;
  origin: LockOrigin;
  assignedByAdminId?: string;
  lockedAt: Date;
  lockReleaseAt: Date | null;
}

export interface NewPlacement {
  lockId: string;
  aggregatorId: string;
  employerName: string;
  startDate: string;
}

export interface RecruiterLockStatsRow {
  locked_by: string;
  locks_acquired: number;
  placements_submitted: number;
}

export interface RecruiterLockStats {
  recruiterId: string;
  locksAcquired: number;
  placementsSubmitted: number;
}

export interface ExpiredLocksResult {
  deactivated: number;
}
