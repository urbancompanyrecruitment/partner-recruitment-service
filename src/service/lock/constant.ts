export const LOCK_SELECT = 'SELECT * FROM recruiter_locks';

export const NOT_RELEASED_SQL = '(lock_release_at IS NULL OR lock_release_at > LOCALTIMESTAMP(3))';

export const HELD_LOCK_SELECT = `
  SELECT l.*, r.email AS locked_by_email
  FROM recruiter_locks l
  JOIN recruiters r ON r.id = l.locked_by`;

export const ADMIN_LOCK_SELECT = `
  SELECT l.*, p.full_name AS partner_name, r.full_name AS recruiter_name, r.company AS recruiter_company
  FROM recruiter_locks l
  JOIN partners p ON p.id = l.partner_id
  JOIN recruiters r ON r.id = l.locked_by`;
