import type { z } from 'zod';
import type { createRecruiterSchema, recruiterLoginSchema, recruiterSignUpSchema } from './schema.js';

export enum RecruiterStatus {
  Pending = 'pending',
  Active = 'active',
  Suspended = 'suspended',
  Rejected = 'rejected',
}

export type RecruiterLoginInput = z.infer<typeof recruiterLoginSchema>;

export type CreateRecruiterInput = z.infer<typeof createRecruiterSchema>;

export type RecruiterSignUpInput = z.infer<typeof recruiterSignUpSchema>;

export interface RecruiterRow {
  id: string;
  email: string;
  full_name: string;
  company: string;
  password_hash: string;
  status: RecruiterStatus;
  failed_login_count: number;
  login_locked_until: string | null;
  created_by_admin_id: string | null;
  reviewed_by_admin_id: string | null;
  reviewed_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecruiterView {
  id: string;
  name: string;
  email: string;
  company: string;
  status: RecruiterStatus;
  active: boolean;
  selfRegistered: boolean;
  lastLoginAt?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface NewRecruiter {
  id: string;
  email: string;
  name: string;
  company: string;
  passwordHash: string;
  status: RecruiterStatus;
  createdByAdminId?: string;
}

export interface CreatedRecruiter {
  recruiter: RecruiterView;
  temporaryPassword: string;
}
