import { execute, query, queryOne, type ExecuteResult, type Queryable } from '../../common/db/index.js';
import type { NewRecruiter, RecruiterRow, RecruiterStatus } from './interface.js';

export const findRecruiterByEmail = (db: Queryable, email: string): Promise<RecruiterRow | undefined> =>
  queryOne<RecruiterRow>(db, 'SELECT * FROM recruiters WHERE email = ?', [email]);

export const findRecruiterById = (db: Queryable, id: string): Promise<RecruiterRow | undefined> =>
  queryOne<RecruiterRow>(db, 'SELECT * FROM recruiters WHERE id = ?', [id]);

export const listRecruiterRows = (db: Queryable): Promise<RecruiterRow[]> =>
  query<RecruiterRow>(db, 'SELECT * FROM recruiters ORDER BY created_at ASC');

export const insertRecruiter = (db: Queryable, recruiter: NewRecruiter): Promise<ExecuteResult> =>
  execute(
    db,
    `INSERT INTO recruiters (id, email, full_name, company, password_hash, status, created_by_admin_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, LOCALTIMESTAMP(3), LOCALTIMESTAMP(3))`,
    [
      recruiter.id,
      recruiter.email,
      recruiter.name,
      recruiter.company,
      recruiter.passwordHash,
      recruiter.status,
      recruiter.createdByAdminId ?? null,
    ],
  );

export const updateRecruiterStatus = (db: Queryable, id: string, status: RecruiterStatus): Promise<ExecuteResult> =>
  execute(db, 'UPDATE recruiters SET status = ?, updated_at = LOCALTIMESTAMP(3) WHERE id = ?', [status, id]);

export const updateRecruiterReview = (db: Queryable, id: string, status: RecruiterStatus, adminId: string): Promise<ExecuteResult> =>
  execute(
    db,
    'UPDATE recruiters SET status = ?, reviewed_by_admin_id = ?, reviewed_at = LOCALTIMESTAMP(3), updated_at = LOCALTIMESTAMP(3) WHERE id = ?',
    [status, adminId, id],
  );

export const updateRecruiterPasswordHash = (db: Queryable, id: string, passwordHash: string): Promise<ExecuteResult> =>
  execute(
    db,
    'UPDATE recruiters SET password_hash = ?, failed_login_count = 0, login_locked_until = NULL, updated_at = LOCALTIMESTAMP(3) WHERE id = ?',
    [passwordHash, id],
  );

export const updateRecruiterLoginFailure = (
  db: Queryable,
  id: string,
  failedCount: number,
  lockedUntil: Date | null,
): Promise<ExecuteResult> =>
  execute(db, 'UPDATE recruiters SET failed_login_count = ?, login_locked_until = ?, updated_at = LOCALTIMESTAMP(3) WHERE id = ?', [
    failedCount,
    lockedUntil,
    id,
  ]);

export const updateRecruiterLoginSuccess = (db: Queryable, id: string): Promise<ExecuteResult> =>
  execute(
    db,
    'UPDATE recruiters SET failed_login_count = 0, login_locked_until = NULL, last_login_at = LOCALTIMESTAMP(3), updated_at = LOCALTIMESTAMP(3) WHERE id = ?',
    [id],
  );
