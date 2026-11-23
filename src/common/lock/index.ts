import {
  ADVISORY_LOCK_SQL,
  ADVISORY_UNLOCK_ALL_SQL,
  LOCK_NOT_AVAILABLE_CODE,
  RESET_LOCK_TIMEOUT_SQL,
  SET_LOCK_TIMEOUT_SQL,
} from '../db/constant.js';
import { execute, pool, type DatabaseError, type DbConnection } from '../db/index.js';
import { AppError, ErrorCode } from '../errors/index.js';
import { logger } from '../logger.js';
import { CHECKSUM_KEY_LENGTH, LOCK_ACQUIRE_TIMEOUT, LOCK_KEY_PREFIX } from './constant.js';

export const lockKey = {
  phone: (checksum: string) => `${LOCK_KEY_PREFIX.phone}:${checksum.slice(0, CHECKSUM_KEY_LENGTH)}`,
  slot: (slotId: string) => `${LOCK_KEY_PREFIX.slot}:${slotId}`,
  partner: (partnerId: string) => `${LOCK_KEY_PREFIX.partner}:${partnerId}`,
  recruiter: (recruiterId: string) => `${LOCK_KEY_PREFIX.recruiter}:${recruiterId}`,
  admin: (adminId: string) => `${LOCK_KEY_PREFIX.admin}:${adminId}`,
};

const acquireLock = (connection: DbConnection, key: string): Promise<unknown> =>
  execute(connection, ADVISORY_LOCK_SQL, [key]).catch((error: DatabaseError) => {
    if (error?.code !== LOCK_NOT_AVAILABLE_CODE) throw error;

    logger.warn({ method: 'withCriticalSection', message: 'Lock not acquired', key_1: 'lock_key', key_1_value: key });

    throw new AppError(ErrorCode.LockUnavailable, { key });
  });

export const withCriticalSection = async <T>(keys: string[], work: (connection: DbConnection) => Promise<T>): Promise<T> => {
  const connection = await pool.connect().catch((error: Error) => {
    logger.error({ method: 'withCriticalSection', message: 'No database connection for lock', error: error?.message || error?.stack });

    throw new AppError(ErrorCode.LockUnavailable);
  });

  try {
    await execute(connection, SET_LOCK_TIMEOUT_SQL, [LOCK_ACQUIRE_TIMEOUT]);

    await keys.reduce((chain, key) => chain.then(() => acquireLock(connection, key)), Promise.resolve<unknown>(undefined));

    await execute(connection, RESET_LOCK_TIMEOUT_SQL);

    return await work(connection);
  } finally {
    const cleaned = await execute(connection, ADVISORY_UNLOCK_ALL_SQL)
      .then(() => execute(connection, RESET_LOCK_TIMEOUT_SQL))
      .then(() => true)
      .catch(() => false);

    connection.release(!cleaned);
  }
};
