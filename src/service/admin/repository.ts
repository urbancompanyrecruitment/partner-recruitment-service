import { execute, query, queryOne, type ExecuteResult, type Queryable } from '../../common/db/index.js';
import type { AdminRow, AdminStatus, NewAdmin } from './interface.js';

export const findAdminByEmail = (db: Queryable, email: string): Promise<AdminRow | undefined> =>
  queryOne<AdminRow>(db, 'SELECT * FROM admins WHERE email = ?', [email]);

export const findAdminById = (db: Queryable, id: string): Promise<AdminRow | undefined> =>
  queryOne<AdminRow>(db, 'SELECT * FROM admins WHERE id = ?', [id]);

export const listAdminRows = (db: Queryable): Promise<AdminRow[]> =>
  query<AdminRow>(db, 'SELECT * FROM admins ORDER BY created_at ASC');

export const insertAdmin = (db: Queryable, admin: NewAdmin): Promise<ExecuteResult> =>
  execute(
    db,
    `INSERT INTO admins (id, email, full_name, password_hash, role, created_by_admin_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, LOCALTIMESTAMP(3), LOCALTIMESTAMP(3))`,
    [admin.id, admin.email, admin.name, admin.passwordHash, admin.role, admin.createdByAdminId ?? null],
  );

export const updateAdminStatus = (db: Queryable, id: string, status: AdminStatus): Promise<ExecuteResult> =>
  execute(db, 'UPDATE admins SET status = ?, updated_at = LOCALTIMESTAMP(3) WHERE id = ?', [status, id]);

export const updateAdminPasswordHash = (db: Queryable, id: string, passwordHash: string): Promise<ExecuteResult> =>
  execute(
    db,
    'UPDATE admins SET password_hash = ?, failed_login_count = 0, login_locked_until = NULL, updated_at = LOCALTIMESTAMP(3) WHERE id = ?',
    [passwordHash, id],
  );

export const updateAdminLoginFailure = (db: Queryable, id: string, failedCount: number, lockedUntil: Date | null): Promise<ExecuteResult> =>
  execute(db, 'UPDATE admins SET failed_login_count = ?, login_locked_until = ?, updated_at = LOCALTIMESTAMP(3) WHERE id = ?', [
    failedCount,
    lockedUntil,
    id,
  ]);

export const updateAdminLoginSuccess = (db: Queryable, id: string): Promise<ExecuteResult> =>
  execute(
    db,
    'UPDATE admins SET failed_login_count = 0, login_locked_until = NULL, last_login_at = LOCALTIMESTAMP(3), updated_at = LOCALTIMESTAMP(3) WHERE id = ?',
    [id],
  );
