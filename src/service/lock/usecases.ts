import { randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { config } from '../../common/config/index.js';
import { pool, withTransaction } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { addHours, dayjs, toIsoDateTime, toOptionalIsoDateTime, todayIsoDate } from '../../common/time.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit, SYSTEM_REQUEST_ID } from '../audit/index.js';
import {
  findPartnersByIds,
  PartnerState,
  requirePartnerRow,
  toPartnerView,
  TRANSITION_REASON,
  transitionPartner,
  type PartnerView,
} from '../partner/index.js';
import {
  InactiveReason,
  LockState,
  type AdminLockRow,
  type AdminLockView,
  type AvailablePartnerFilters,
  type ExpiredLocksResult,
  type LockedPartner,
  type LockRow,
  type LockView,
  type PlacementInput,
} from './interface.js';
import {
  deactivateExpiredLockRows,
  findActiveLock,
  findLatestLockForRecruiter,
  insertLock,
  listAdminLocks,
  listAvailablePartnerRows,
  listLocksByRecruiter,
  updateLockPlacement,
  updateLockReleased,
  updatePlacementDetails,
} from './repository.js';

export const toLockView = (row: LockRow): LockView => ({
  id: row.id,
  partnerId: row.partner_id,
  recruiterId: row.locked_by,
  lockedAt: toIsoDateTime(row.locked_at),
  lockReleaseAt: toIsoDateTime(row.lock_release_at),
  state: row.state,
  inactiveReason: row.inactive_reason ?? undefined,
  inactiveAt: toOptionalIsoDateTime(row.inactive_at),
  employerName: row.employer_name ?? undefined,
  startDate: row.start_date ?? undefined,
  placementRecordedAt: toOptionalIsoDateTime(row.placement_recorded_at),
});

const toAdminLockView = (row: AdminLockRow): AdminLockView => ({
  ...toLockView(row),
  partnerName: row.partner_name,
  recruiterName: row.recruiter_name,
  recruiterCompany: row.recruiter_company,
});

const isLive = (lock: LockRow): boolean => lock.state === LockState.Active && dayjs.utc(lock.lock_release_at).isAfter(dayjs());

export const listAvailablePartners = async (filters: AvailablePartnerFilters): Promise<PartnerView[]> =>
  (await listAvailablePartnerRows(pool, filters.country)).map(row => toPartnerView(row, false));

export const lockPartner = (partnerId: string, recruiterId: string, requestId: string): Promise<LockedPartner> =>
  withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const partner = await requirePartnerRow(connection, partnerId);

    if (partner.state !== PartnerState.Verified) throw new AppError(ErrorCode.NotAvailable, { partnerId });

    const activeLock = await findActiveLock(connection, partnerId);

    if (activeLock && activeLock.locked_by !== recruiterId) throw new AppError(ErrorCode.NotAvailable, { partnerId });

    const lock = activeLock ?? (await createLock(connection, partnerId, recruiterId, requestId));

    return { lock: toLockView(lock), partner: toPartnerView(partner, true) };
  });

const createLock = async (connection: PoolConnection, partnerId: string, recruiterId: string, requestId: string): Promise<LockRow> => {
  const lockedAt = new Date();
  const lock = { id: randomUUID(), partnerId, recruiterId, lockedAt, lockReleaseAt: addHours(lockedAt, config.lockTtlHours) };
  const actor = { actorType: ActorType.Recruiter, actorId: recruiterId };

  await withTransaction(connection, async () => {
    await insertLock(connection, lock);

    await recordAudit(connection, {
      ...actor,
      action: AuditAction.LockCreated,
      entityType: AuditEntityType.Lock,
      entityId: lock.id,
      data: { partnerId, lockReleaseAt: lock.lockReleaseAt.toISOString() },
      requestId,
    });

    await recordAudit(connection, {
      ...actor,
      action: AuditAction.PhoneRevealed,
      entityType: AuditEntityType.Partner,
      entityId: partnerId,
      data: { lockId: lock.id },
      requestId,
    });
  });

  logger.info({ method: 'lockPartner', partnerId, key_1: 'recruiter_id', key_1_value: recruiterId, key_2: 'lock_id', key_2_value: lock.id });

  const created = await findLatestLockForRecruiter(connection, partnerId, recruiterId);

  if (!created) throw new AppError(ErrorCode.NotAvailable, { partnerId });

  return created;
};

const requireOwnLock = async (
  connection: PoolConnection | typeof pool,
  partnerId: string,
  recruiterId: string,
): Promise<LockRow> => {
  const lock = await findLatestLockForRecruiter(connection, partnerId, recruiterId);

  if (!lock) throw new AppError(ErrorCode.NotLockOwner, { partnerId });

  if (lock.inactive_reason === InactiveReason.Placed || isLive(lock)) return lock;

  throw new AppError(ErrorCode.LockExpired, { partnerId });
};

export const getLockedPartner = async (partnerId: string, recruiterId: string, requestId: string): Promise<LockedPartner> => {
  const lock = await requireOwnLock(pool, partnerId, recruiterId);
  const partner = await requirePartnerRow(pool, partnerId);

  await recordAudit(pool, {
    action: AuditAction.PhoneRevealed,
    actorType: ActorType.Recruiter,
    actorId: recruiterId,
    entityType: AuditEntityType.Partner,
    entityId: partnerId,
    data: { lockId: lock.id },
    requestId,
  });

  return { lock: toLockView(lock), partner: toPartnerView(partner, true) };
};

export const listMyLocks = async (recruiterId: string): Promise<LockedPartner[]> => {
  const locks = await listLocksByRecruiter(pool, recruiterId);
  const partners = await findPartnersByIds(pool, [...new Set(locks.map(lock => lock.partner_id))]);
  const partnerById = new Map(partners.map(partner => [partner.id, toPartnerView(partner, false)]));

  return locks
    .filter(lock => partnerById.has(lock.partner_id))
    .map(lock => ({ lock: toLockView(lock), partner: partnerById.get(lock.partner_id) as PartnerView }));
};

export const recordPlacement = (partnerId: string, recruiterId: string, input: PlacementInput, requestId: string): Promise<LockView> =>
  withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const lock = await requireOwnLock(connection, partnerId, recruiterId);

    if (input.startDate < todayIsoDate()) throw new AppError(ErrorCode.InvalidStartDate);

    const partner = await requirePartnerRow(connection, partnerId);
    const actor = { actorType: ActorType.Recruiter, actorId: recruiterId };

    await withTransaction(connection, async () => {
      if (lock.inactive_reason === InactiveReason.Placed) {
        await updatePlacementDetails(connection, lock.id, input.employerName, input.startDate);

        return;
      }

      await updateLockPlacement(connection, lock.id, input.employerName, input.startDate);

      await transitionPartner(connection, partner, PartnerState.Placed, actor, TRANSITION_REASON.placementSaved, requestId);

      await recordAudit(connection, {
        ...actor,
        action: AuditAction.LockPlaced,
        entityType: AuditEntityType.Lock,
        entityId: lock.id,
        data: { partnerId, employerName: input.employerName, startDate: input.startDate },
        requestId,
      });
    });

    logger.info({ method: 'recordPlacement', partnerId, key_1: 'lock_id', key_1_value: lock.id, key_2: 'start_date', key_2_value: input.startDate });

    const updated = await findLatestLockForRecruiter(connection, partnerId, recruiterId);

    return toLockView(updated ?? lock);
  });

export const releaseLock = (partnerId: string, recruiterId: string, requestId: string): Promise<LockView> =>
  withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const lock = await requireOwnLock(connection, partnerId, recruiterId);

    if (lock.state !== LockState.Active) throw new AppError(ErrorCode.LockExpired, { partnerId });

    await withTransaction(connection, async () => {
      await updateLockReleased(connection, lock.id);

      await recordAudit(connection, {
        action: AuditAction.LockReleased,
        actorType: ActorType.Recruiter,
        actorId: recruiterId,
        entityType: AuditEntityType.Lock,
        entityId: lock.id,
        data: { partnerId },
        requestId,
      });
    });

    const updated = await findLatestLockForRecruiter(connection, partnerId, recruiterId);

    return toLockView(updated ?? lock);
  });

export const listAllLocks = async (): Promise<AdminLockView[]> => (await listAdminLocks(pool)).map(toAdminLockView);

export const deactivateExpiredLocks = async (): Promise<ExpiredLocksResult> => {
  const result = await deactivateExpiredLockRows(pool);

  if (result.affectedRows > 0) {
    await recordAudit(pool, {
      action: AuditAction.LocksDeactivated,
      actorType: ActorType.System,
      entityType: AuditEntityType.Lock,
      entityId: SYSTEM_REQUEST_ID,
      data: { deactivated: result.affectedRows },
      requestId: SYSTEM_REQUEST_ID,
    });
  }

  logger.info({ method: 'deactivateExpiredLocks', key_1: 'deactivated', key_1_value: String(result.affectedRows) });

  return { deactivated: result.affectedRows };
};
