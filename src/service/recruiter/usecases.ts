import { randomUUID } from 'node:crypto';
import type { ChangePasswordInput, TemporaryPasswordResult } from '../../common/auth/index.js';
import { assertNotLocked, nextLoginFailure } from '../../common/auth/lockout.js';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../../common/crypto/password.js';
import { pool, withTransaction, type Queryable } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { toIsoDateTime, toOptionalIsoDateTime } from '../../common/time.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import { PasswordResetAccountType } from '../passwordReset/interface.js';
import { voidResetLinks } from '../passwordReset/repository.js';
import { BLOCKED_STATUS_ERROR, RECRUITER_STATUS_TRANSITIONS, REVIEWED_FROM_STATUSES } from './constant.js';
import {
  RecruiterStatus,
  type CreatedRecruiter,
  type CreateRecruiterInput,
  type RecruiterLoginInput,
  type RecruiterRow,
  type RecruiterSignUpInput,
  type RecruiterView,
  type SignedInRecruiter,
} from './interface.js';
import {
  findRecruiterByEmail,
  findRecruiterById,
  insertRecruiter,
  listRecruiterRows,
  updateRecruiterLoginFailure,
  updateRecruiterLoginSuccess,
  updateRecruiterPasswordHash,
  updateRecruiterReview,
  updateRecruiterStatus,
} from './repository.js';

export const toRecruiterView = (row: RecruiterRow): RecruiterView => ({
  id: row.id,
  name: row.full_name,
  email: row.email,
  company: row.company,
  status: row.status,
  active: row.status === RecruiterStatus.Active,
  selfRegistered: !row.created_by_admin_id,
  lastLoginAt: toOptionalIsoDateTime(row.last_login_at),
  reviewedAt: toOptionalIsoDateTime(row.reviewed_at),
  createdAt: toIsoDateTime(row.created_at),
});

export const requireRecruiterRow = async (db: Queryable, recruiterId: string): Promise<RecruiterRow> => {
  const recruiter = await findRecruiterById(db, recruiterId);

  if (!recruiter) throw new AppError(ErrorCode.NotFound, { recruiterId });

  return recruiter;
};

export const assertNotBlocked = (status: RecruiterStatus): void => {
  const blocked = BLOCKED_STATUS_ERROR[status];

  if (blocked) throw new AppError(blocked);
};

export const loginRecruiter = async (input: RecruiterLoginInput, requestId: string): Promise<SignedInRecruiter> => {
  const known = await findRecruiterByEmail(pool, input.email);

  if (!known) throw new AppError(ErrorCode.InvalidCredentials);

  return withCriticalSection([lockKey.recruiter(known.id)], async connection => {
    const recruiter = await requireRecruiterRow(connection, known.id);

    assertNotLocked(recruiter.login_locked_until);

    const matches = await verifyPassword(recruiter.password_hash, input.password);

    if (!matches) {
      const failure = nextLoginFailure(recruiter.failed_login_count);

      await updateRecruiterLoginFailure(connection, recruiter.id, failure.failedCount, failure.lockedUntil);

      throw new AppError(ErrorCode.InvalidCredentials);
    }

    assertNotBlocked(recruiter.status);

    await updateRecruiterLoginSuccess(connection, recruiter.id);

    await recordAudit(connection, {
      action: AuditAction.RecruiterLoggedIn,
      actorType: ActorType.Recruiter,
      actorId: recruiter.id,
      entityType: AuditEntityType.Recruiter,
      entityId: recruiter.id,
      requestId,
    });

    return { recruiter: toRecruiterView(recruiter), sessionVersion: recruiter.session_version };
  });
};

export const listRecruiters = async (): Promise<RecruiterView[]> => (await listRecruiterRows(pool)).map(toRecruiterView);

export const signUpRecruiter = async (input: RecruiterSignUpInput, requestId: string): Promise<RecruiterView> => {
  const existing = await findRecruiterByEmail(pool, input.email);

  if (existing) throw new AppError(ErrorCode.EmailAlreadyRegistered);

  const id = randomUUID();

  await insertRecruiter(pool, {
    id,
    email: input.email,
    name: input.name,
    company: input.company,
    passwordHash: await hashPassword(input.password),
    status: RecruiterStatus.Pending,
  });

  await recordAudit(pool, {
    action: AuditAction.RecruiterSignedUp,
    actorType: ActorType.Recruiter,
    actorId: id,
    entityType: AuditEntityType.Recruiter,
    entityId: id,
    data: { company: input.company },
    requestId,
  });

  logger.info({ method: 'signUpRecruiter', key_1: 'recruiter_id', key_1_value: id });

  return toRecruiterView(await requireRecruiterRow(pool, id));
};

export const createRecruiter = async (input: CreateRecruiterInput, adminId: string, requestId: string): Promise<CreatedRecruiter> => {
  const existing = await findRecruiterByEmail(pool, input.email);

  if (existing) throw new AppError(ErrorCode.EmailAlreadyRegistered);

  const temporaryPassword = generateTemporaryPassword();
  const id = randomUUID();

  await insertRecruiter(pool, {
    id,
    email: input.email,
    name: input.name,
    company: input.company,
    passwordHash: await hashPassword(temporaryPassword),
    status: RecruiterStatus.Active,
    createdByAdminId: adminId,
  });

  await recordAudit(pool, {
    action: AuditAction.RecruiterCreated,
    actorType: ActorType.Admin,
    actorId: adminId,
    entityType: AuditEntityType.Recruiter,
    entityId: id,
    data: { company: input.company },
    requestId,
  });

  logger.info({ method: 'createRecruiter', key_1: 'recruiter_id', key_1_value: id, key_2: 'admin_id', key_2_value: adminId });

  return { recruiter: toRecruiterView(await requireRecruiterRow(pool, id)), temporaryPassword };
};

export const setRecruiterStatus = (recruiterId: string, status: RecruiterStatus, adminId: string, requestId: string): Promise<RecruiterView> =>
  withCriticalSection([lockKey.recruiter(recruiterId)], async connection => {
    const recruiter = await requireRecruiterRow(connection, recruiterId);

    if (!RECRUITER_STATUS_TRANSITIONS[recruiter.status].includes(status)) {
      throw new AppError(ErrorCode.InvalidTransition, { from: recruiter.status, to: status });
    }

    if (REVIEWED_FROM_STATUSES.includes(recruiter.status)) {
      await updateRecruiterReview(connection, recruiterId, status, adminId);
    }

    if (!REVIEWED_FROM_STATUSES.includes(recruiter.status)) {
      await updateRecruiterStatus(connection, recruiterId, status);
    }

    await recordAudit(connection, {
      action: AuditAction.RecruiterStatusChanged,
      actorType: ActorType.Admin,
      actorId: adminId,
      entityType: AuditEntityType.Recruiter,
      entityId: recruiterId,
      data: { from: recruiter.status, to: status },
      requestId,
    });

    logger.info({
      method: 'setRecruiterStatus',
      key_1: 'recruiter_id',
      key_1_value: recruiterId,
      key_2: 'status',
      key_2_value: status,
      key_3: 'admin_id',
      key_3_value: adminId,
    });

    return toRecruiterView(await requireRecruiterRow(connection, recruiterId));
  });

export const changeRecruiterPassword = (recruiterId: string, input: ChangePasswordInput, requestId: string): Promise<number> =>
  withCriticalSection([lockKey.recruiter(recruiterId)], async connection => {
    const recruiter = await requireRecruiterRow(connection, recruiterId);
    const matches = await verifyPassword(recruiter.password_hash, input.currentPassword);

    if (!matches) throw new AppError(ErrorCode.CurrentPasswordIncorrect);

    await withTransaction(connection, async () => {
      await updateRecruiterPasswordHash(connection, recruiterId, await hashPassword(input.newPassword));

      await voidResetLinks(connection, PasswordResetAccountType.Recruiter, recruiterId);
    });

    await recordAudit(connection, {
      action: AuditAction.RecruiterPasswordChanged,
      actorType: ActorType.Recruiter,
      actorId: recruiterId,
      entityType: AuditEntityType.Recruiter,
      entityId: recruiterId,
      requestId,
    });

    return (await requireRecruiterRow(connection, recruiterId)).session_version;
  });

export const resetRecruiterPassword = (recruiterId: string, adminId: string, requestId: string): Promise<TemporaryPasswordResult> =>
  withCriticalSection([lockKey.recruiter(recruiterId)], async connection => {
    await requireRecruiterRow(connection, recruiterId);

    const temporaryPassword = generateTemporaryPassword();

    await withTransaction(connection, async () => {
      await updateRecruiterPasswordHash(connection, recruiterId, await hashPassword(temporaryPassword));

      await voidResetLinks(connection, PasswordResetAccountType.Recruiter, recruiterId);
    });

    await recordAudit(connection, {
      action: AuditAction.RecruiterPasswordReset,
      actorType: ActorType.Admin,
      actorId: adminId,
      entityType: AuditEntityType.Recruiter,
      entityId: recruiterId,
      requestId,
    });

    logger.info({ method: 'resetRecruiterPassword', key_1: 'recruiter_id', key_1_value: recruiterId, key_2: 'admin_id', key_2_value: adminId });

    return { temporaryPassword };
  });
