import { createHash } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/index.js';
import { AppError, ErrorCode } from '../errors/index.js';
import { logger } from '../logger.js';
import { CHECKSUM_KEY_LENGTH, LOCK_ACQUIRE_TIMEOUT_SECONDS, LOCK_KEY_PREFIX, MAX_LOCK_NAME_LENGTH } from './constant.js';

export const lockKey = {
  phone: (checksum: string) => `${LOCK_KEY_PREFIX.phone}:${checksum.slice(0, CHECKSUM_KEY_LENGTH)}`,
  email: (checksum: string) => `${LOCK_KEY_PREFIX.email}:${checksum.slice(0, CHECKSUM_KEY_LENGTH)}`,
  slot: (slotId: string) => `${LOCK_KEY_PREFIX.slot}:${slotId}`,
  partner: (partnerId: string) => `${LOCK_KEY_PREFIX.partner}:${partnerId}`,
  recruiter: (recruiterId: string) => `${LOCK_KEY_PREFIX.recruiter}:${recruiterId}`,
};

const lockName = (key: string): string =>
  key.length <= MAX_LOCK_NAME_LENGTH ? key : createHash('sha256').update(key).digest('hex');

const acquireLock = async (connection: PoolConnection, key: string): Promise<void> => {
  const [rows] = await connection.query<RowDataPacket[]>('SELECT GET_LOCK(?, ?) AS acquired', [
    lockName(key),
    LOCK_ACQUIRE_TIMEOUT_SECONDS,
  ]);

  if (rows[0]?.acquired === 1) return;

  logger.warn({ method: 'withCriticalSection', message: 'Lock not acquired', key_1: 'lock_key', key_1_value: key });

  throw new AppError(ErrorCode.LockUnavailable, { key });
};

const releaseLock = (connection: PoolConnection, key: string): Promise<unknown> =>
  connection.query('SELECT RELEASE_LOCK(?)', [lockName(key)]);

export const withCriticalSection = async <T>(
  keys: string[],
  work: (connection: PoolConnection) => Promise<T>,
): Promise<T> => {
  const connection = await pool.getConnection().catch((error: Error) => {
    logger.error({ method: 'withCriticalSection', message: 'No database connection for lock', error: error?.message || error?.stack });

    throw new AppError(ErrorCode.LockUnavailable);
  });

  try {
    await keys.reduce((chain, key) => chain.then(() => acquireLock(connection, key)), Promise.resolve());

    return await work(connection);
  } finally {
    await keys
      .reduce((chain, key) => chain.then(() => releaseLock(connection, key)), Promise.resolve<unknown>(undefined))
      .catch(() => undefined);

    connection.release();
  }
};
