export const POOL_CONNECTION_LIMIT = 10;

export const MIGRATIONS_DIRECTORY = 'migrations';

export const MIGRATIONS_TABLE = 'schema_migrations';

export const MIGRATIONS_LOCK_NAME = 'partner_recruitment_migrations';

export const MIGRATIONS_LOCK_TIMEOUT = '60s';

export const SQL_FILE_EXTENSION = '.sql';

export const SESSION_OPTIONS = '-c TimeZone=UTC';

export const PLACEHOLDER = '?';

export const FRACTION_SEPARATOR = '.';

export const FRACTION_DIGITS = 3;

export const ADVISORY_LOCK_SQL = 'SELECT pg_advisory_lock(hashtextextended(?, 0))';

export const ADVISORY_UNLOCK_ALL_SQL = 'SELECT pg_advisory_unlock_all()';

export const SET_LOCK_TIMEOUT_SQL = "SELECT set_config('lock_timeout', ?, false)";

export const RESET_LOCK_TIMEOUT_SQL = 'RESET lock_timeout';

export const LOCK_NOT_AVAILABLE_CODE = '55P03';
