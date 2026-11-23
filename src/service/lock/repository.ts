import { execute, query, queryOne, type ExecuteResult, type Queryable } from '../../common/db/index.js';
import { PARTNER_SELECT, PartnerState, type PartnerRow } from '../partner/index.js';
import { ADMIN_LOCK_SELECT, HELD_LOCK_SELECT, LOCK_SELECT, NOT_RELEASED_SQL } from './constant.js';
import {
  InactiveReason,
  LockState,
  type AdminLockRow,
  type HeldLockRow,
  type LockRow,
  type NewLock,
  type NewPlacement,
  type RecruiterLockStatsRow,
} from './interface.js';

export const findActiveLock = (db: Queryable, partnerId: string): Promise<LockRow | undefined> =>
  queryOne<LockRow>(db, `${LOCK_SELECT} WHERE partner_id = ? AND state = ? AND ${NOT_RELEASED_SQL}`, [partnerId, LockState.Active]);

export const findHeldLock = (db: Queryable, partnerId: string): Promise<HeldLockRow | undefined> =>
  queryOne<HeldLockRow>(db, `${HELD_LOCK_SELECT} WHERE l.partner_id = ? AND l.state = ?`, [partnerId, LockState.Active]);

export const findLockById = (db: Queryable, lockId: string): Promise<LockRow | undefined> =>
  queryOne<LockRow>(db, `${LOCK_SELECT} WHERE id = ?`, [lockId]);

export const findLatestLockForRecruiter = (db: Queryable, partnerId: string, recruiterId: string): Promise<LockRow | undefined> =>
  queryOne<LockRow>(db, `${LOCK_SELECT} WHERE partner_id = ? AND locked_by = ? ORDER BY locked_at DESC LIMIT 1`, [
    partnerId,
    recruiterId,
  ]);

export const listLocksByRecruiter = (db: Queryable, recruiterId: string): Promise<LockRow[]> =>
  query<LockRow>(db, `${LOCK_SELECT} WHERE locked_by = ? ORDER BY locked_at DESC`, [recruiterId]);

export const listAdminLocks = (db: Queryable): Promise<AdminLockRow[]> =>
  query<AdminLockRow>(db, `${ADMIN_LOCK_SELECT} ORDER BY l.locked_at DESC`);

export const listRecruiterLockStatsRows = (db: Queryable): Promise<RecruiterLockStatsRow[]> =>
  query<RecruiterLockStatsRow>(
    db,
    `SELECT locked_by, COUNT(*) AS locks_acquired, COUNT(*) FILTER (WHERE inactive_reason = ?) AS placements_submitted
     FROM recruiter_locks GROUP BY locked_by`,
    [InactiveReason.Placed],
  );

export const listAvailablePartnerRows = (db: Queryable, country?: string): Promise<PartnerRow[]> =>
  query<PartnerRow>(
    db,
    `${PARTNER_SELECT}
     LEFT JOIN recruiter_locks l ON l.partner_id = p.id AND l.state = ? AND ${NOT_RELEASED_SQL}
     WHERE p.state = ? AND l.id IS NULL${country ? ' AND p.current_country = ?' : ''}
     ORDER BY p.verified_at DESC NULLS LAST, p.created_at DESC`,
    country ? [LockState.Active, PartnerState.Verified, country] : [LockState.Active, PartnerState.Verified],
  );

export const insertLock = (db: Queryable, lock: NewLock): Promise<ExecuteResult> =>
  execute(
    db,
    `INSERT INTO recruiter_locks (id, partner_id, locked_by, origin, assigned_by_admin_id, locked_at, lock_release_at, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, LOCALTIMESTAMP(3), LOCALTIMESTAMP(3))`,
    [
      lock.id,
      lock.partnerId,
      lock.recruiterId,
      lock.origin,
      lock.assignedByAdminId ?? null,
      lock.lockedAt,
      lock.lockReleaseAt,
      LockState.Active,
    ],
  );

export const updateLockPlacement = (db: Queryable, placement: NewPlacement): Promise<ExecuteResult> =>
  execute(
    db,
    `UPDATE recruiter_locks
     SET aggregator_id = ?, employer_name = ?, start_date = ?, placement_recorded_at = LOCALTIMESTAMP(3),
         state = ?, inactive_reason = ?, inactive_at = LOCALTIMESTAMP(3), updated_at = LOCALTIMESTAMP(3)
     WHERE id = ? AND state = ? AND ${NOT_RELEASED_SQL}`,
    [
      placement.aggregatorId,
      placement.employerName,
      placement.startDate,
      LockState.Inactive,
      InactiveReason.Placed,
      placement.lockId,
      LockState.Active,
    ],
  );

export const updateLockReleased = (db: Queryable, lockId: string): Promise<ExecuteResult> =>
  execute(
    db,
    'UPDATE recruiter_locks SET state = ?, inactive_reason = ?, inactive_at = LOCALTIMESTAMP(3), updated_at = LOCALTIMESTAMP(3) WHERE id = ? AND state = ?',
    [LockState.Inactive, InactiveReason.Released, lockId, LockState.Active],
  );

export const deactivateExpiredLockRows = (db: Queryable, partnerId?: string): Promise<ExecuteResult> =>
  execute(
    db,
    `UPDATE recruiter_locks SET state = ?, inactive_reason = ?, inactive_at = LOCALTIMESTAMP(3), updated_at = LOCALTIMESTAMP(3)
     WHERE state = ? AND lock_release_at <= LOCALTIMESTAMP(3)${partnerId ? ' AND partner_id = ?' : ''}`,
    partnerId
      ? [LockState.Inactive, InactiveReason.Expired, LockState.Active, partnerId]
      : [LockState.Inactive, InactiveReason.Expired, LockState.Active],
  );
