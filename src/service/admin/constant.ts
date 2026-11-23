export const EXPORT_CSV_HEADERS = ['name', 'location', 'primary_mobile'];

export const EXPORT_FILE_NAME = 'signed-up-partners.csv';

export const OPS_UPLOAD_CSV_HEADERS = ['name', 'phone', 'city_key', 'category_key', 'source_type', 'experiment_name'];

export const OPS_UPLOAD_FILE_NAME = 'ops-lead-upload.csv';

export const OPS_UPLOAD_MAX_ROWS = 10_000;

export const FAIL_CSV_FILE_NAME = 'verification-failures.csv';

export const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';

export const EMAIL_MAX_LENGTH = 190;

export const NAME_MAX_LENGTH = 120;

export const ADMIN_LOGIN_RATE_LIMIT = { max: 10, timeWindow: '10 minutes' };

export const CLI_CREATOR = 'cli';
