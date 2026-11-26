import { config } from '../src/common/config/index.js';
import { count, execute, pool, query, queryOne, toPoolConfig } from '../src/common/db/index.js';
import { AppError, ErrorCode } from '../src/common/errors/index.js';
import { withCriticalSection } from '../src/common/lock/index.js';
import { closeDatabase, prepareDatabase } from './helpers.js';

const HOLD_MS = 300;

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

describe('database layer on Postgres', () => {
  beforeAll(async () => {
    await prepareDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('connects with the URL as given when no CA certificate is configured', () => {
    const url = 'postgres://app:secret@db.internal:5432/recruitment?sslmode=require';

    expect(toPoolConfig(url)).toEqual({ connectionString: url, max: config.databasePoolMax, options: '-c TimeZone=UTC' });
  });

  it('verifies the server against the configured CA certificate and drops the SSL flags from the URL', () => {
    const poolConfig = toPoolConfig('postgres://app.ref:p%40ss@pooler.internal:5432/postgres?sslmode=require&ssl=true&application_name=portal', 'PEM');

    expect(poolConfig.connectionString).toBe('postgres://app.ref:p%40ss@pooler.internal:5432/postgres?application_name=portal');
    expect(poolConfig.ssl).toEqual({ ca: 'PEM' });
    expect(poolConfig.max).toBe(config.databasePoolMax);
  });

  it('runs every session in UTC whatever the server default is', async () => {
    const row = await queryOne<{ zone: string }>(pool, "SELECT current_setting('TimeZone') AS zone");

    expect(row?.zone).toBe('UTC');
  });

  it('returns timestamps as UTC wall-clock strings with three fraction digits, and dates and times as text', async () => {
    const row = await queryOne<{ half: string; whole: string; day: string; clock: string }>(
      pool,
      "SELECT TIMESTAMP '2026-11-23 10:15:30.5' AS half, TIMESTAMP '2026-11-23 10:15:30' AS whole, DATE '2026-11-23' AS day, TIME '08:00' AS clock",
    );

    expect(row).toEqual({ half: '2026-11-23 10:15:30.500', whole: '2026-11-23 10:15:30', day: '2026-11-23', clock: '08:00:00' });
  });

  it('stores a Date parameter as the same instant in UTC', async () => {
    const instant = new Date('2026-11-23T18:45:10.250+05:30');
    const row = await queryOne<{ stored: string }>(pool, 'SELECT ?::timestamp(3) AS stored', [instant]);

    expect(row?.stored).toBe('2026-11-23 13:15:10.250');
  });

  it('numbers the placeholders in order and reads counts as numbers', async () => {
    const row = await queryOne<{ first: string; second: number; third: boolean }>(
      pool,
      'SELECT ?::text AS first, ?::int AS second, ?::boolean AS third',
      ['a', 2, true],
    );
    const slots = await count(pool, 'SELECT COUNT(*) AS total FROM interview_slots WHERE city_key = ANY(?)', [['singapore', 'yangon']]);
    const updated = await execute(pool, 'UPDATE interview_slots SET capacity = capacity WHERE city_key = ?', ['singapore']);

    expect(row).toEqual({ first: 'a', second: 2, third: true });
    expect(slots).toBe(20);
    expect(updated.affectedRows).toBe(10);
  });

  it('lets only one request at a time into a critical section for the same key', async () => {
    const order: string[] = [];
    const enter = (name: string) =>
      withCriticalSection(['partner:serial'], async () => {
        order.push(`${name}:start`);

        await wait(HOLD_MS);

        order.push(`${name}:end`);
      });

    await Promise.all([enter('first'), enter('second')]);

    expect(order.filter(step => step.endsWith(':start'))).toHaveLength(2);
    expect(order[0].split(':')[0]).toBe(order[1].split(':')[0]);
    expect(order[2].split(':')[0]).toBe(order[3].split(':')[0]);
  });

  it('frees the key when the work fails, and leaves no advisory lock on the pooled connection', async () => {
    await expect(
      withCriticalSection(['partner:failing'], async () => {
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');

    const entered = await withCriticalSection(['partner:failing'], async () => true);
    const held = await query(pool, "SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()");

    expect(entered).toBe(true);
    expect(held).toEqual([]);
  });

  it('answers LOCK_UNAVAILABLE when a key stays held past the acquire timeout', async () => {
    const release: { now?: () => void } = {};
    const holder = withCriticalSection(['partner:held'], () => new Promise<void>(resolve => {
      release.now = resolve;
    }));

    await wait(HOLD_MS);

    const blocked = await withCriticalSection(['partner:held'], async () => 'entered').catch((error: AppError) => error);

    release.now?.();

    await holder;

    expect(blocked).toBeInstanceOf(AppError);
    expect((blocked as AppError).code).toBe(ErrorCode.LockUnavailable);
  });
});
