import type { ResultSetHeader } from 'mysql2/promise';
import { execute, query, queryOne, type Queryable } from '../../common/db/index.js';
import { PartnerState } from '../partner/interface.js';
import type { PartnerRow } from '../partner/interface.js';
import { ADMIN_LOCK_SELECT, LOCK_SELECT } from './constant.js';
import { InactiveReason, LockState, type AdminLockRow, type LockRow, type NewLock } from './interface.js';

export const findActiveLock = (db: Queryable, partnerId: string): Promise<LockRow | undefined> =>
  queryOne<LockRow>(db, `${LOCK_SELECT} WHERE partner_id = ? AND state = ? AND lock_release_at > NOW(3)`, [
    partnerId,
    LockState.Active,
  ]);

export const findLatestLockForRecruiter = (db: Queryable, partnerId: string, recruiterId: string): Promise<LockRow | undefined> =>
  queryOne<LockRow>(db, `${LOCK_SELECT} WHERE partner_id = ? AND locked_by = ? ORDER BY locked_at DESC LIMIT 1`, [
    partnerId,
    recruiterId,
  ]);

export const listLocksByRecruiter = (db: Queryable, recruiterId: string): Promise<LockRow[]> =>
  query<LockRow>(db, `${LOCK_SELECT} WHERE locked_by = ? ORDER BY locked_at DESC`, [recruiterId]);

export const listAdminLocks = (db: Queryable): Promise<AdminLockRow[]> =>
  query<AdminLockRow>(db, `${ADMIN_LOCK_SELECT} ORDER BY l.locked_at DESC`);

export const listAvailablePartnerRows = (db: Queryable, country?: string): Promise<PartnerRow[]> =>
  query<PartnerRow>(
    db,
    `SELECT p.*, b.city_key AS booking_city_key, b.starts_at AS booking_starts_at
     FROM partners p
     LEFT JOIN slot_bookings b ON b.partner_id = p.id
     LEFT JOIN recruiter_locks l ON l.partner_id = p.id AND l.state = ? AND l.lock_release_at > NOW(3)
     WHERE p.state = ? AND l.id IS NULL${country ? ' AND p.current_country = ?' : ''}
     ORDER BY p.verified_at DESC, p.created_at DESC`,
    country ? [LockState.Active, PartnerState.Verified, country] : [LockState.Active, PartnerState.Verified],
  );

export const insertLock = (db: Queryable, lock: NewLock): Promise<ResultSetHeader> =>
  execute(
    db,
    `INSERT INTO recruiter_locks (id, partner_id, locked_by, locked_at, lock_release_at, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
    [lock.id, lock.partnerId, lock.recruiterId, lock.lockedAt, lock.lockReleaseAt, LockState.Active],
  );

export const updateLockPlacement = (db: Queryable, lockId: string, employerName: string, startDate: string): Promise<ResultSetHeader> =>
  execute(
    db,
    `UPDATE recruiter_locks
     SET employer_name = ?, start_date = ?, placement_recorded_at = NOW(3),
         state = ?, inactive_reason = ?, inactive_at = COALESCE(inactive_at, NOW(3)), updated_at = NOW(3)
     WHERE id = ?`,
    [employerName, startDate, LockState.Inactive, InactiveReason.Placed, lockId],
  );

export const updatePlacementDetails = (db: Queryable, lockId: string, employerName: string, startDate: string): Promise<ResultSetHeader> =>
  execute(db, 'UPDATE recruiter_locks SET employer_name = ?, start_date = ?, updated_at = NOW(3) WHERE id = ?', [
    employerName,
    startDate,
    lockId,
  ]);

export const updateLockReleased = (db: Queryable, lockId: string): Promise<ResultSetHeader> =>
  execute(
    db,
    'UPDATE recruiter_locks SET state = ?, inactive_reason = ?, inactive_at = NOW(3), updated_at = NOW(3) WHERE id = ?',
    [LockState.Inactive, InactiveReason.Released, lockId],
  );

export const deactivateExpiredLockRows = (db: Queryable): Promise<ResultSetHeader> =>
  execute(
    db,
    `UPDATE recruiter_locks SET state = ?, inactive_reason = ?, inactive_at = NOW(3), updated_at = NOW(3)
     WHERE state = ? AND lock_release_at <= NOW(3)`,
    [LockState.Inactive, InactiveReason.Expired, LockState.Active],
  );
