import { execute, query, queryOne, type ExecuteResult, type Queryable } from '../../common/db/index.js';
import type { AggregatorRow, NewAggregator } from './interface.js';

export const listActiveAggregatorRows = (db: Queryable): Promise<AggregatorRow[]> =>
  query<AggregatorRow>(db, 'SELECT * FROM recruiter_aggregators WHERE is_active ORDER BY name ASC');

export const listActiveAggregatorRowsByRecruiter = (db: Queryable, recruiterId: string): Promise<AggregatorRow[]> =>
  query<AggregatorRow>(db, 'SELECT * FROM recruiter_aggregators WHERE recruiter_id = ? AND is_active ORDER BY name ASC', [
    recruiterId,
  ]);

export const findActiveAggregatorRow = (db: Queryable, recruiterId: string, aggregatorId: string): Promise<AggregatorRow | undefined> =>
  queryOne<AggregatorRow>(db, 'SELECT * FROM recruiter_aggregators WHERE id = ? AND recruiter_id = ? AND is_active', [
    aggregatorId,
    recruiterId,
  ]);

export const findActiveAggregatorRowByName = (db: Queryable, recruiterId: string, name: string): Promise<AggregatorRow | undefined> =>
  queryOne<AggregatorRow>(db, 'SELECT * FROM recruiter_aggregators WHERE recruiter_id = ? AND LOWER(name) = LOWER(?) AND is_active', [
    recruiterId,
    name,
  ]);

export const insertAggregator = (db: Queryable, aggregator: NewAggregator): Promise<ExecuteResult> =>
  execute(
    db,
    `INSERT INTO recruiter_aggregators (id, recruiter_id, name, created_by_admin_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, LOCALTIMESTAMP(3), LOCALTIMESTAMP(3))`,
    [aggregator.id, aggregator.recruiterId, aggregator.name, aggregator.adminId],
  );

export const deactivateAggregatorRow = (db: Queryable, aggregatorId: string): Promise<ExecuteResult> =>
  execute(db, 'UPDATE recruiter_aggregators SET is_active = FALSE, updated_at = LOCALTIMESTAMP(3) WHERE id = ? AND is_active', [aggregatorId]);
