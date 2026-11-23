import { randomUUID } from 'node:crypto';
import type { Actor } from '../../common/auth/index.js';
import { config } from '../../common/config/index.js';
import { pool, withTransaction, type DbConnection } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { addHours, dayjs, toIsoDateTime, toOptionalIsoDateTime, todayIsoDate } from '../../common/time.js';
import { requireActiveAggregator } from '../aggregator/index.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit, SYSTEM_REQUEST_ID } from '../audit/index.js';
import { notifyPartner, PartnerNotificationType } from '../notification/index.js';
import {
  findPartnersByIds,
  PartnerState,
  requirePartnerRow,
  toPartnerView,
  TRANSITION_REASON,
  transitionPartner,
  type PartnerRow,
  type PartnerView,
  type TransitionActor,
} from '../partner/index.js';
import { findRecruiterById, RecruiterStatus } from '../recruiter/index.js';
import {
  InactiveReason,
  LockOrigin,
  LockState,
  type AdminLockRow,
  type AdminLockView,
  type AvailablePartnerFilters,
  type ExpiredLocksResult,
  type LockedPartner,
  type LockRequest,
  type LockRow,
  type LockView,
  type PlacementInput,
  type RecruiterLockStats,
} from './interface.js';
import {
  deactivateExpiredLockRows,
  findActiveLock,
  findHeldLock,
  findLatestLockForRecruiter,
  findLockById,
  insertLock,
  listAdminLocks,
  listAvailablePartnerRows,
  listLocksByRecruiter,
  listRecruiterLockStatsRows,
  updateLockPlacement,
  updateLockReleased,
} from './repository.js';

export const toLockView = (row: LockRow): LockView => ({
  id: row.id,
  partnerId: row.partner_id,
  recruiterId: row.locked_by,
  origin: row.origin,
  lockedAt: toIsoDateTime(row.locked_at),
  lockReleaseAt: toOptionalIsoDateTime(row.lock_release_at),
  state: row.state,
  inactiveReason: row.inactive_reason ?? undefined,
  inactiveAt: toOptionalIsoDateTime(row.inactive_at),
  employerName: row.employer_name ?? undefined,
  aggregatorId: row.aggregator_id ?? undefined,
  startDate: row.start_date ?? undefined,
  placementRecordedAt: toOptionalIsoDateTime(row.placement_recorded_at),
});

const toAdminLockView = (row: AdminLockRow): AdminLockView => ({
  ...toLockView(row),
  partnerName: row.partner_name,
  recruiterName: row.recruiter_name,
  recruiterCompany: row.recruiter_company,
});

const isLive = (lock: LockRow): boolean =>
  lock.state === LockState.Active && (!lock.lock_release_at || dayjs.utc(lock.lock_release_at).isAfter(dayjs()));

const insertLockWithAudit = async (connection: DbConnection, request: LockRequest, requestId: string): Promise<string> => {
  const lockId = randomUUID();
  const lockedAt = new Date();
  const lockReleaseAt = request.expires ? addHours(lockedAt, config.lockTtlHours) : null;

  await deactivateExpiredLockRows(connection, request.partnerId);

  await insertLock(connection, {
    id: lockId,
    partnerId: request.partnerId,
    recruiterId: request.recruiterId,
    origin: request.origin,
    assignedByAdminId: request.origin === LockOrigin.Admin ? request.actor.actorId : undefined,
    lockedAt,
    lockReleaseAt,
  });

  await recordAudit(connection, {
    ...request.actor,
    action: AuditAction.LockCreated,
    entityType: AuditEntityType.Lock,
    entityId: lockId,
    data: {
      partnerId: request.partnerId,
      recruiterId: request.recruiterId,
      origin: request.origin,
      lockReleaseAt: lockReleaseAt?.toISOString() ?? null,
    },
    requestId,
  });

  logger.info({
    method: 'insertLockWithAudit',
    partnerId: request.partnerId,
    key_1: 'recruiter_id',
    key_1_value: request.recruiterId,
    key_2: 'lock_id',
    key_2_value: lockId,
    key_3: 'origin',
    key_3_value: request.origin,
  });

  if (request.origin !== LockOrigin.Recruiter) return lockId;

  await recordAudit(connection, {
    ...request.actor,
    action: AuditAction.PhoneRevealed,
    entityType: AuditEntityType.Partner,
    entityId: request.partnerId,
    data: { lockId },
    requestId,
  });

  return lockId;
};

const createLock = async (connection: DbConnection, request: LockRequest, requestId: string): Promise<LockRow> => {
  const lockId = await withTransaction(connection, () => insertLockWithAudit(connection, request, requestId));
  const created = await findLockById(connection, lockId);

  if (!created) throw new AppError(ErrorCode.NotAvailable, { partnerId: request.partnerId });

  return created;
};

export const listAvailablePartners = async (filters: AvailablePartnerFilters): Promise<PartnerView[]> =>
  (await listAvailablePartnerRows(pool, filters.country)).map(row => toPartnerView(row, false));

export const lockPartner = (partnerId: string, recruiterId: string, requestId: string): Promise<LockedPartner> =>
  withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const partner = await requirePartnerRow(connection, partnerId);

    if (partner.state !== PartnerState.Verified) throw new AppError(ErrorCode.NotAvailable, { partnerId });

    const activeLock = await findActiveLock(connection, partnerId);

    if (activeLock && activeLock.locked_by !== recruiterId) throw new AppError(ErrorCode.NotAvailable, { partnerId });

    const lock =
      activeLock ??
      (await createLock(
        connection,
        {
          partnerId,
          recruiterId,
          origin: LockOrigin.Recruiter,
          expires: true,
          actor: { actorType: ActorType.Recruiter, actorId: recruiterId },
        },
        requestId,
      ));

    return { lock: toLockView(lock), partner: toPartnerView(partner, true) };
  });

export const assignPartner = (partnerId: string, recruiterId: string, adminId: string, requestId: string): Promise<LockView> =>
  withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const partner = await requirePartnerRow(connection, partnerId);

    if (partner.state !== PartnerState.Verified) throw new AppError(ErrorCode.NotAvailable, { partnerId });

    const recruiter = await findRecruiterById(connection, recruiterId);

    if (!recruiter) throw new AppError(ErrorCode.NotFound, { recruiterId });

    if (recruiter.status !== RecruiterStatus.Active) throw new AppError(ErrorCode.RecruiterNotActive, { recruiterId });

    const activeLock = await findActiveLock(connection, partnerId);

    if (activeLock) throw new AppError(ErrorCode.NotAvailable, { partnerId });

    const lock = await createLock(
      connection,
      { partnerId, recruiterId, origin: LockOrigin.Admin, expires: true, actor: { actorType: ActorType.Admin, actorId: adminId } },
      requestId,
    );

    return toLockView(lock);
  });

export const lockForRegistrar = async (
  connection: DbConnection,
  partner: PartnerRow,
  actor: TransitionActor,
  requestId: string,
): Promise<void> => {
  if (!partner.registered_by_recruiter_id) return;

  const recruiter = await findRecruiterById(connection, partner.registered_by_recruiter_id);

  if (recruiter?.status !== RecruiterStatus.Active) return;

  await insertLockWithAudit(
    connection,
    { partnerId: partner.id, recruiterId: recruiter.id, origin: LockOrigin.Registration, expires: false, actor },
    requestId,
  );
};

const requireOwnLock = async (
  connection: DbConnection | typeof pool,
  partnerId: string,
  recruiterId: string,
): Promise<LockRow> => {
  const lock = await findLatestLockForRecruiter(connection, partnerId, recruiterId);

  if (!lock) throw new AppError(ErrorCode.NotLockOwner, { partnerId });

  if (lock.inactive_reason === InactiveReason.Placed || isLive(lock)) return lock;

  throw new AppError(ErrorCode.LockExpired, { partnerId });
};

const requireHeldLock = async (connection: DbConnection, partnerId: string, recruiter: Actor): Promise<LockRow> => {
  const lock = await findHeldLock(connection, partnerId);

  if (!lock) throw new AppError(ErrorCode.LockExpired, { partnerId });

  if (lock.locked_by !== recruiter.id || lock.locked_by_email !== recruiter.email) {
    throw new AppError(ErrorCode.NotLockOwner, { partnerId });
  }

  if (!isLive(lock)) throw new AppError(ErrorCode.LockExpired, { partnerId });

  return lock;
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

export const recordPlacement = (partnerId: string, recruiter: Actor, input: PlacementInput, requestId: string): Promise<LockView> =>
  withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const lock = await requireHeldLock(connection, partnerId, recruiter);

    if (input.startDate < todayIsoDate()) throw new AppError(ErrorCode.InvalidStartDate);

    const aggregator = await requireActiveAggregator(connection, recruiter.id, input.aggregatorId);
    const partner = await requirePartnerRow(connection, partnerId);
    const actor = { actorType: ActorType.Recruiter, actorId: recruiter.id };

    await withTransaction(connection, async () => {
      const placed = await updateLockPlacement(connection, {
        lockId: lock.id,
        aggregatorId: aggregator.id,
        employerName: aggregator.name,
        startDate: input.startDate,
      });

      if (placed.affectedRows !== 1) throw new AppError(ErrorCode.LockExpired, { partnerId });

      await transitionPartner(connection, partner, PartnerState.Placed, actor, TRANSITION_REASON.placementSaved, requestId);

      await notifyPartner(connection, partnerId, PartnerNotificationType.Placement, {
        aggregatorName: aggregator.name,
        startDate: input.startDate,
      });

      await recordAudit(connection, {
        ...actor,
        action: AuditAction.LockPlaced,
        entityType: AuditEntityType.Lock,
        entityId: lock.id,
        data: { partnerId, aggregatorId: aggregator.id, employerName: aggregator.name, startDate: input.startDate },
        requestId,
      });
    });

    logger.info({ method: 'recordPlacement', partnerId, key_1: 'lock_id', key_1_value: lock.id, key_2: 'start_date', key_2_value: input.startDate });

    const updated = await findLockById(connection, lock.id);

    return toLockView(updated ?? lock);
  });

export const releaseLock = (partnerId: string, recruiter: Actor, requestId: string): Promise<LockView> =>
  withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const lock = await requireHeldLock(connection, partnerId, recruiter);

    await withTransaction(connection, async () => {
      await updateLockReleased(connection, lock.id);

      await recordAudit(connection, {
        action: AuditAction.LockReleased,
        actorType: ActorType.Recruiter,
        actorId: recruiter.id,
        entityType: AuditEntityType.Lock,
        entityId: lock.id,
        data: { partnerId },
        requestId,
      });
    });

    const updated = await findLockById(connection, lock.id);

    return toLockView(updated ?? lock);
  });

export const listAllLocks = async (): Promise<AdminLockView[]> => (await listAdminLocks(pool)).map(toAdminLockView);

export const listRecruiterLockStats = async (): Promise<RecruiterLockStats[]> =>
  (await listRecruiterLockStatsRows(pool)).map(row => ({
    recruiterId: row.locked_by,
    locksAcquired: Number(row.locks_acquired),
    placementsSubmitted: Number(row.placements_submitted),
  }));

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
