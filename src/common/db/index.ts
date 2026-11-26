import pg, { type PoolConfig, type QueryResultRow } from 'pg';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { dayjs, DB_DATE_TIME_FORMAT } from '../time.js';
import { FRACTION_DIGITS, FRACTION_SEPARATOR, PLACEHOLDER, SESSION_OPTIONS, SSL_URL_PARAMS } from './constant.js';
import type { CountRow, DbConnection, ExecuteResult, Queryable } from './interface.js';

pg.types.setTypeParser(pg.types.builtins.INT8, Number);

pg.types.setTypeParser(pg.types.builtins.DATE, value => value);

pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, value => {
  const [wallClock, fraction] = value.split(FRACTION_SEPARATOR);

  return fraction ? `${wallClock}${FRACTION_SEPARATOR}${fraction.padEnd(FRACTION_DIGITS, '0')}` : value;
});

export const toPoolConfig = (databaseUrl: string, caCert = config.databaseCaCert): PoolConfig => {
  const shared = { max: config.databasePoolMax, options: SESSION_OPTIONS };

  if (!caCert) return { ...shared, connectionString: databaseUrl };

  const url = new URL(databaseUrl);

  SSL_URL_PARAMS.forEach(param => url.searchParams.delete(param));

  return { ...shared, connectionString: url.toString(), ssl: { ca: caCert } };
};

export const createPool = (databaseUrl: string) => {
  const created = new pg.Pool(toPoolConfig(databaseUrl));

  created.on('error', error => {
    logger.error({ method: 'createPool', message: 'Idle database connection failed', error: error?.message || error?.stack });
  });

  return created;
};

export const pool = createPool(config.databaseUrl);

const run = (db: Queryable, sql: string, params: unknown[]) =>
  db.query(
    sql.split(PLACEHOLDER).reduce((statement, part, index) => `${statement}$${index}${part}`),
    params.map(param => (param instanceof Date ? dayjs.utc(param).format(DB_DATE_TIME_FORMAT) : param)),
  );

export const query = async <T = QueryResultRow>(db: Queryable, sql: string, params: unknown[] = []): Promise<T[]> => {
  const result = await run(db, sql, params);

  return result.rows as T[];
};

export const queryOne = async <T = QueryResultRow>(db: Queryable, sql: string, params: unknown[] = []): Promise<T | undefined> => {
  const rows = await query<T>(db, sql, params);

  return rows[0];
};

export const count = async (db: Queryable, sql: string, params: unknown[] = []): Promise<number> => {
  const row = await queryOne<CountRow>(db, sql, params);

  return Number(row?.total ?? 0);
};

export const execute = async (db: Queryable, sql: string, params: unknown[] = []): Promise<ExecuteResult> => {
  const result = await run(db, sql, params);

  return { affectedRows: result.rowCount ?? 0 };
};

export const withTransaction = async <T>(connection: DbConnection, work: () => Promise<T>): Promise<T> => {
  await connection.query('BEGIN');

  try {
    const result = await work();

    await connection.query('COMMIT');

    return result;
  } catch (error) {
    await connection.query('ROLLBACK');

    throw error;
  }
};

export type { DatabaseError, DbConnection, ExecuteResult, Queryable } from './interface.js';
