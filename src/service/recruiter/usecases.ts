import { randomUUID } from 'node:crypto';
import { assertNotLocked, nextLoginFailure } from '../../common/auth/lockout.js';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../../common/crypto/password.js';
import { pool } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { toIsoDateTime, toOptionalIsoDateTime } from '../../common/time.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import {
  RecruiterStatus,
  type CreatedRecruiter,
  type CreateRecruiterInput,
  type RecruiterLoginInput,
  type RecruiterRow,
  type RecruiterView,
} from './interface.js';
import {
  findRecruiterByEmail,
  findRecruiterById,
  insertRecruiter,
  listRecruiterRows,
  updateRecruiterLoginFailure,
  updateRecruiterLoginSuccess,
  updateRecruiterStatus,
} from './repository.js';

export const toRecruiterView = (row: RecruiterRow): RecruiterView => ({
  id: row.id,
  name: row.full_name,
  email: row.email,
  company: row.company,
  status: row.status,
  active: row.status === RecruiterStatus.Active,
  lastLoginAt: toOptionalIsoDateTime(row.last_login_at),
  createdAt: toIsoDateTime(row.created_at),
});

export const requireRecruiterRow = async (recruiterId: string): Promise<RecruiterRow> => {
  const recruiter = await findRecruiterById(pool, recruiterId);

  if (!recruiter) throw new AppError(ErrorCode.NotFound, { recruiterId });

  return recruiter;
};

export const loginRecruiter = async (input: RecruiterLoginInput, requestId: string): Promise<RecruiterView> => {
  const known = await findRecruiterByEmail(pool, input.email);

  if (!known) throw new AppError(ErrorCode.InvalidCredentials);

  return withCriticalSection([lockKey.recruiter(known.id)], async connection => {
    const recruiter = (await findRecruiterById(connection, known.id)) ?? known;

    assertNotLocked(recruiter.login_locked_until);

    const matches = await verifyPassword(recruiter.password_hash, input.password);

    if (!matches) {
      const failure = nextLoginFailure(recruiter.failed_login_count);

      await updateRecruiterLoginFailure(connection, recruiter.id, failure.failedCount, failure.lockedUntil);

      throw new AppError(ErrorCode.InvalidCredentials);
    }

    if (recruiter.status !== RecruiterStatus.Active) throw new AppError(ErrorCode.RecruiterSuspended);

    await updateRecruiterLoginSuccess(connection, recruiter.id);

    await recordAudit(connection, {
      action: AuditAction.RecruiterLoggedIn,
      actorType: ActorType.Recruiter,
      actorId: recruiter.id,
      entityType: AuditEntityType.Recruiter,
      entityId: recruiter.id,
      requestId,
    });

    return toRecruiterView(recruiter);
  });
};

export const listRecruiters = async (): Promise<RecruiterView[]> => (await listRecruiterRows(pool)).map(toRecruiterView);

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

  return { recruiter: toRecruiterView(await requireRecruiterRow(id)), temporaryPassword };
};

export const setRecruiterStatus = (recruiterId: string, status: RecruiterStatus, adminId: string, requestId: string): Promise<RecruiterView> =>
  withCriticalSection([lockKey.recruiter(recruiterId)], async connection => {
    const recruiter = await findRecruiterById(connection, recruiterId);

    if (!recruiter) throw new AppError(ErrorCode.NotFound, { recruiterId });

    await updateRecruiterStatus(connection, recruiterId, status);

    await recordAudit(connection, {
      action: AuditAction.RecruiterStatusChanged,
      actorType: ActorType.Admin,
      actorId: adminId,
      entityType: AuditEntityType.Recruiter,
      entityId: recruiterId,
      data: { from: recruiter.status, to: status },
      requestId,
    });

    return toRecruiterView({ ...recruiter, status } as RecruiterRow);
  });
