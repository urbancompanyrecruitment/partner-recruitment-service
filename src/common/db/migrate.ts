import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import {
  ADVISORY_LOCK_SQL,
  ADVISORY_UNLOCK_ALL_SQL,
  MIGRATIONS_DIRECTORY,
  MIGRATIONS_LOCK_NAME,
  MIGRATIONS_LOCK_TIMEOUT,
  MIGRATIONS_TABLE,
  SET_LOCK_TIMEOUT_SQL,
  SQL_FILE_EXTENSION,
} from './constant.js';
import { createPool, execute, query, withTransaction } from './index.js';
import type { MigrationRow } from './interface.js';

const migrationsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..', MIGRATIONS_DIRECTORY);

export const runMigrations = async (databaseUrl: string): Promise<string[]> => {
  const migrationPool = createPool(databaseUrl);
  const connection = await migrationPool.connect();

  try {
    await execute(connection, SET_LOCK_TIMEOUT_SQL, [MIGRATIONS_LOCK_TIMEOUT]);

    await execute(connection, ADVISORY_LOCK_SQL, [MIGRATIONS_LOCK_NAME]);

    await execute(
      connection,
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name VARCHAR(255) NOT NULL PRIMARY KEY, applied_at TIMESTAMP(3) NOT NULL)`,
    );

    const appliedRows = await query<MigrationRow>(connection, `SELECT name FROM ${MIGRATIONS_TABLE}`);
    const applied = new Set(appliedRows.map(row => row.name));
    const files = (await readdir(migrationsPath)).filter(file => file.endsWith(SQL_FILE_EXTENSION)).sort();
    const pending = files.filter(file => !applied.has(file));

    await pending.reduce(
      (chain, file) =>
        chain.then(async () => {
          const sql = await readFile(path.join(migrationsPath, file), 'utf8');

          await withTransaction(connection, async () => {
            await connection.query(sql);

            await execute(connection, `INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, LOCALTIMESTAMP(3))`, [file]);
          });

          logger.info({ method: 'runMigrations', key_1: 'migration', key_1_value: file });
        }),
      Promise.resolve(),
    );

    return pending;
  } finally {
    await execute(connection, ADVISORY_UNLOCK_ALL_SQL).catch(() => undefined);

    connection.release();

    await migrationPool.end();
  }
};

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runMigrations(config.databaseUrl)
    .then(applied => {
      logger.info({ method: 'runMigrations', key_1: 'applied_count', key_1_value: String(applied.length) });

      process.exit(0);
    })
    .catch((error: Error) => {
      logger.error({ method: 'runMigrations', message: 'Migrations failed', error: error?.message || error?.stack });

      process.exit(1);
    });
}
