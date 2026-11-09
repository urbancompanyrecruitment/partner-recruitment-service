export const EMPLOYER_NAME_MAX_LENGTH = 160;

export const LOCK_SELECT = 'SELECT * FROM recruiter_locks';

export const ADMIN_LOCK_SELECT = `
  SELECT l.*, p.full_name AS partner_name, r.full_name AS recruiter_name, r.company AS recruiter_company
  FROM recruiter_locks l
  JOIN partners p ON p.id = l.partner_id
  JOIN recruiters r ON r.id = l.locked_by`;
