import { randomUUID } from 'node:crypto';
import type { ChangePasswordInput, TemporaryPasswordResult } from '../../common/auth/index.js';
import { assertNotLocked, nextLoginFailure } from '../../common/auth/lockout.js';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../../common/crypto/password.js';
import { pool, type Queryable } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { toIsoDateTime, toOptionalIsoDateTime } from '../../common/time.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import {
  AdminStatus,
  type AdminLoginInput,
  type AdminRow,
  type AdminView,
  type CreateAdminInput,
  type CreatedAdmin,
} from './interface.js';
import {
  findAdminByEmail,
  findAdminById,
  insertAdmin,
  listAdminRows,
  updateAdminLoginFailure,
  updateAdminLoginSuccess,
  updateAdminPasswordHash,
  updateAdminStatus,
} from './repository.js';

export const toAdminView = (row: AdminRow): AdminView => ({
  id: row.id,
  name: row.full_name,
  email: row.email,
  role: row.role,
  status: row.status,
  active: row.status === AdminStatus.Active,
  lastLoginAt: toOptionalIsoDateTime(row.last_login_at),
  createdAt: toIsoDateTime(row.created_at),
});

export const requireAdminRow = async (db: Queryable, adminId: string): Promise<AdminRow> => {
  const admin = await findAdminById(db, adminId);

  if (!admin) throw new AppError(ErrorCode.NotFound, { adminId });

  return admin;
};

export const loginAdmin = async (input: AdminLoginInput, requestId: string): Promise<AdminView> => {
  const known = await findAdminByEmail(pool, input.email);

  if (!known) throw new AppError(ErrorCode.InvalidCredentials);

  return withCriticalSection([lockKey.admin(known.id)], async connection => {
    const admin = await requireAdminRow(connection, known.id);

    assertNotLocked(admin.login_locked_until);

    const matches = await verifyPassword(admin.password_hash, input.password);

    if (!matches) {
      const failure = nextLoginFailure(admin.failed_login_count);

      await updateAdminLoginFailure(connection, admin.id, failure.failedCount, failure.lockedUntil);

      throw new AppError(ErrorCode.InvalidCredentials);
    }

    if (admin.status !== AdminStatus.Active) throw new AppError(ErrorCode.AdminSuspended);

    await updateAdminLoginSuccess(connection, admin.id);

    await recordAudit(connection, {
      action: AuditAction.AdminLoggedIn,
      actorType: ActorType.Admin,
      actorId: admin.id,
      entityType: AuditEntityType.Admin,
      entityId: admin.id,
      requestId,
    });

    return toAdminView(admin);
  });
};

export const listAdmins = async (): Promise<AdminView[]> => (await listAdminRows(pool)).map(toAdminView);

export const createAdmin = async (input: CreateAdminInput, createdBy: string, requestId: string): Promise<CreatedAdmin> => {
  const existing = await findAdminByEmail(pool, input.email);

  if (existing) throw new AppError(ErrorCode.EmailAlreadyRegistered);

  const temporaryPassword = generateTemporaryPassword();
  const id = randomUUID();

  await insertAdmin(pool, {
    id,
    email: input.email,
    name: input.name,
    passwordHash: await hashPassword(temporaryPassword),
    role: input.role,
    createdByAdminId: createdBy,
  });

  await recordAudit(pool, {
    action: AuditAction.AdminCreated,
    actorType: ActorType.Admin,
    actorId: createdBy,
    entityType: AuditEntityType.Admin,
    entityId: id,
    data: { role: input.role },
    requestId,
  });

  logger.info({ method: 'createAdmin', key_1: 'admin_id', key_1_value: id, key_2: 'created_by', key_2_value: createdBy, key_3: 'role', key_3_value: input.role });

  return { admin: toAdminView(await requireAdminRow(pool, id)), temporaryPassword };
};

export const setAdminStatus = (adminId: string, status: AdminStatus, actingAdminId: string, requestId: string): Promise<AdminView> => {
  if (adminId === actingAdminId) throw new AppError(ErrorCode.Forbidden, { reason: 'own_account' });

  return withCriticalSection([lockKey.admin(adminId)], async connection => {
    const admin = await requireAdminRow(connection, adminId);

    await updateAdminStatus(connection, adminId, status);

    await recordAudit(connection, {
      action: AuditAction.AdminStatusChanged,
      actorType: ActorType.Admin,
      actorId: actingAdminId,
      entityType: AuditEntityType.Admin,
      entityId: adminId,
      data: { from: admin.status, to: status },
      requestId,
    });

    return toAdminView(await requireAdminRow(connection, adminId));
  });
};

export const resetAdminPassword = (adminId: string, actingAdminId: string, requestId: string): Promise<TemporaryPasswordResult> =>
  withCriticalSection([lockKey.admin(adminId)], async connection => {
    await requireAdminRow(connection, adminId);

    const temporaryPassword = generateTemporaryPassword();

    await updateAdminPasswordHash(connection, adminId, await hashPassword(temporaryPassword));

    await recordAudit(connection, {
      action: AuditAction.AdminPasswordReset,
      actorType: ActorType.Admin,
      actorId: actingAdminId,
      entityType: AuditEntityType.Admin,
      entityId: adminId,
      requestId,
    });

    return { temporaryPassword };
  });

export const changeAdminPassword = (adminId: string, input: ChangePasswordInput, requestId: string): Promise<void> =>
  withCriticalSection([lockKey.admin(adminId)], async connection => {
    const admin = await requireAdminRow(connection, adminId);
    const matches = await verifyPassword(admin.password_hash, input.currentPassword);

    if (!matches) throw new AppError(ErrorCode.CurrentPasswordIncorrect);

    await updateAdminPasswordHash(connection, adminId, await hashPassword(input.newPassword));

    await recordAudit(connection, {
      action: AuditAction.AdminPasswordChanged,
      actorType: ActorType.Admin,
      actorId: adminId,
      entityType: AuditEntityType.Admin,
      entityId: adminId,
      requestId,
    });
  });
