import type { z } from 'zod';
import type { AggregatorView } from '../aggregator/index.js';
import type { RecruiterView } from '../recruiter/index.js';
import type { adminLoginSchema, createAdminSchema, partnerFiltersSchema, singaporePhoneSchema } from './schema.js';

export enum AdminRole {
  SuperAdmin = 'super_admin',
  Admin = 'admin',
}

export enum AdminStatus {
  Active = 'active',
  Suspended = 'suspended',
}

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export type SingaporePhoneInput = z.infer<typeof singaporePhoneSchema>;

export type PartnerFiltersInput = z.infer<typeof partnerFiltersSchema>;

export interface AdminRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: AdminRole;
  status: AdminStatus;
  failed_login_count: number;
  login_locked_until: string | null;
  last_login_at: string | null;
  created_by_admin_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminView {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  active: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface NewAdmin {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: AdminRole;
  createdByAdminId?: string;
}

export interface CreatedAdmin {
  admin: AdminView;
  temporaryPassword: string;
}

export interface RecruiterWithStats extends RecruiterView {
  locksAcquired: number;
  placementsSubmitted: number;
  aggregators: AggregatorView[];
}
