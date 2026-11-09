import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RowDataPacket } from 'mysql2/promise';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import {
  MIGRATIONS_DIRECTORY,
  MIGRATIONS_LOCK_NAME,
  MIGRATIONS_LOCK_TIMEOUT_SECONDS,
  MIGRATIONS_TABLE,
  SQL_FILE_EXTENSION,
} from './constant.js';
import { createPool, execute, query } from './index.js';
import type { MigrationRow } from './interface.js';

const migrationsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..', MIGRATIONS_DIRECTORY);

export const runMigrations = async (databaseUrl: string): Promise<string[]> => {
  const migrationPool = createPool(databaseUrl, true);
  const connection = await migrationPool.getConnection();

  try {
    const [lockRows] = await connection.query<RowDataPacket[]>('SELECT GET_LOCK(?, ?) AS acquired', [
      MIGRATIONS_LOCK_NAME,
      MIGRATIONS_LOCK_TIMEOUT_SECONDS,
    ]);

    if (lockRows[0]?.acquired !== 1) throw new Error('Could not acquire the migrations lock');

    await execute(
      connection,
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name VARCHAR(255) NOT NULL PRIMARY KEY, applied_at DATETIME(3) NOT NULL)`,
    );

    const appliedRows = await query<MigrationRow>(connection, `SELECT name FROM ${MIGRATIONS_TABLE}`);
    const applied = new Set(appliedRows.map(row => row.name));
    const files = (await readdir(migrationsPath)).filter(file => file.endsWith(SQL_FILE_EXTENSION)).sort();
    const pending = files.filter(file => !applied.has(file));

    await pending.reduce(
      (chain, file) =>
        chain.then(async () => {
          const sql = await readFile(path.join(migrationsPath, file), 'utf8');

          await connection.query(sql);

          await execute(connection, `INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, NOW(3))`, [file]);

          logger.info({ method: 'runMigrations', key_1: 'migration', key_1_value: file });
        }),
      Promise.resolve(),
    );

    await connection.query('SELECT RELEASE_LOCK(?)', [MIGRATIONS_LOCK_NAME]);

    return pending;
  } finally {
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
