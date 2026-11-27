import type { z } from 'zod';
import type { ExecuteResult, Queryable } from '../../common/db/index.js';
import type { ActorType, AuditEntityType } from '../audit/interface.js';
import type { forgotPasswordSchema, resetPasswordSchema } from './schema.js';

export enum PasswordResetAccountType {
  Recruiter = 'recruiter',
  Admin = 'admin',
}

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export interface ResettableAccountRow {
  id: string;
  email: string;
  full_name: string;
}

export interface ResettableAccountStore {
  actorType: ActorType;
  entityType: AuditEntityType;
  lockKey: (accountId: string) => string;
  findByEmail: (db: Queryable, email: string) => Promise<ResettableAccountRow | undefined>;
  updatePasswordHash: (db: Queryable, accountId: string, passwordHash: string) => Promise<ExecuteResult>;
}

export interface PasswordResetTokenRow {
  id: string;
  account_type: PasswordResetAccountType;
  account_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface NewPasswordResetToken {
  id: string;
  accountType: PasswordResetAccountType;
  accountId: string;
  tokenHash: string;
  expiresAt: Date;
}
