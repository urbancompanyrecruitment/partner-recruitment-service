import mysql, { type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { config } from '../config/index.js';
import { POOL_CONNECTION_LIMIT, SESSION_TIME_ZONE_SQL } from './constant.js';
import type { CountRow, Queryable } from './interface.js';

export const createPool = (databaseUrl: string, multipleStatements = false) => {
  const created = mysql.createPool({
    uri: databaseUrl,
    waitForConnections: true,
    connectionLimit: POOL_CONNECTION_LIMIT,
    dateStrings: true,
    timezone: 'Z',
    decimalNumbers: true,
    multipleStatements,
  });

  created.on('connection', connection => {
    connection.query(SESSION_TIME_ZONE_SQL);
  });

  return created;
};

export const pool = createPool(config.databaseUrl);

export const query = async <T extends RowDataPacket>(db: Queryable, sql: string, params: unknown[] = []): Promise<T[]> => {
  const [rows] = await db.query<T[]>(sql, params);

  return rows;
};

export const queryOne = async <T extends RowDataPacket>(
  db: Queryable,
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> => {
  const rows = await query<T>(db, sql, params);

  return rows[0];
};

export const count = async (db: Queryable, sql: string, params: unknown[] = []): Promise<number> => {
  const row = await queryOne<CountRow>(db, sql, params);

  return Number(row?.total ?? 0);
};

export const execute = async (db: Queryable, sql: string, params: unknown[] = []): Promise<ResultSetHeader> => {
  const [result] = await db.query<ResultSetHeader>(sql, params);

  return result;
};

export const withTransaction = async <T>(connection: PoolConnection, work: () => Promise<T>): Promise<T> => {
  await connection.beginTransaction();

  try {
    const result = await work();

    await connection.commit();

    return result;
  } catch (error) {
    await connection.rollback();

    throw error;
  }
};

export type { Queryable } from './interface.js';
