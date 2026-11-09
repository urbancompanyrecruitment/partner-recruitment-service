import type { RowDataPacket } from 'mysql2/promise';
import type { z } from 'zod';
import type { createRecruiterSchema, recruiterLoginSchema } from './schema.js';

export enum RecruiterStatus {
  Active = 'active',
  Suspended = 'suspended',
}

export type RecruiterLoginInput = z.infer<typeof recruiterLoginSchema>;

export type CreateRecruiterInput = z.infer<typeof createRecruiterSchema>;

export interface RecruiterRow extends RowDataPacket {
  id: string;
  email: string;
  full_name: string;
  company: string;
  password_hash: string;
  status: RecruiterStatus;
  failed_login_count: number;
  login_locked_until: string | null;
  created_by_admin_id: string;
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
  lastLoginAt?: string;
  createdAt: string;
}

export interface NewRecruiter {
  id: string;
  email: string;
  name: string;
  company: string;
  passwordHash: string;
  createdByAdminId: string;
}

export interface CreatedRecruiter {
  recruiter: RecruiterView;
  temporaryPassword: string;
}
