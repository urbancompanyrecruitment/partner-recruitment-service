import { randomUUID } from 'node:crypto';
import { pool, type Queryable } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { toIsoDateTime } from '../../common/time.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import { findRecruiterById } from '../recruiter/index.js';
import type { AddAggregatorInput, AggregatorRow, AggregatorView } from './interface.js';
import {
  deactivateAggregatorRow,
  findActiveAggregatorRow,
  findActiveAggregatorRowByName,
  insertAggregator,
  listActiveAggregatorRows,
  listActiveAggregatorRowsByRecruiter,
} from './repository.js';

const toAggregatorView = (row: AggregatorRow): AggregatorView => ({
  id: row.id,
  recruiterId: row.recruiter_id,
  name: row.name,
  createdAt: toIsoDateTime(row.created_at),
});

export const listAggregators = async (recruiterId: string): Promise<AggregatorView[]> =>
  (await listActiveAggregatorRowsByRecruiter(pool, recruiterId)).map(toAggregatorView);

export const listAllAggregators = async (): Promise<AggregatorView[]> => (await listActiveAggregatorRows(pool)).map(toAggregatorView);

export const requireActiveAggregator = async (db: Queryable, recruiterId: string, aggregatorId: string): Promise<AggregatorView> => {
  const aggregator = await findActiveAggregatorRow(db, recruiterId, aggregatorId);

  if (!aggregator) throw new AppError(ErrorCode.UnknownAggregator, { aggregatorId });

  return toAggregatorView(aggregator);
};

export const addAggregator = (recruiterId: string, input: AddAggregatorInput, adminId: string, requestId: string): Promise<AggregatorView> =>
  withCriticalSection([lockKey.recruiter(recruiterId)], async connection => {
    const recruiter = await findRecruiterById(connection, recruiterId);

    if (!recruiter) throw new AppError(ErrorCode.NotFound, { recruiterId });

    const existing = await findActiveAggregatorRowByName(connection, recruiterId, input.name);

    if (existing) throw new AppError(ErrorCode.AggregatorAlreadyExists, { aggregatorId: existing.id });

    const id = randomUUID();

    await insertAggregator(connection, { id, recruiterId, name: input.name, adminId });

    await recordAudit(connection, {
      action: AuditAction.AggregatorAdded,
      actorType: ActorType.Admin,
      actorId: adminId,
      entityType: AuditEntityType.Aggregator,
      entityId: id,
      data: { recruiterId, name: input.name },
      requestId,
    });

    logger.info({ method: 'addAggregator', key_1: 'recruiter_id', key_1_value: recruiterId, key_2: 'aggregator_id', key_2_value: id });

    return requireActiveAggregator(connection, recruiterId, id);
  });

export const removeAggregator = (recruiterId: string, aggregatorId: string, adminId: string, requestId: string): Promise<void> =>
  withCriticalSection([lockKey.recruiter(recruiterId)], async connection => {
    const aggregator = await findActiveAggregatorRow(connection, recruiterId, aggregatorId);

    if (!aggregator) throw new AppError(ErrorCode.NotFound, { aggregatorId });

    await deactivateAggregatorRow(connection, aggregatorId);

    await recordAudit(connection, {
      action: AuditAction.AggregatorRemoved,
      actorType: ActorType.Admin,
      actorId: adminId,
      entityType: AuditEntityType.Aggregator,
      entityId: aggregatorId,
      data: { recruiterId, name: aggregator.name },
      requestId,
    });

    logger.info({
      method: 'removeAggregator',
      key_1: 'recruiter_id',
      key_1_value: recruiterId,
      key_2: 'aggregator_id',
      key_2_value: aggregatorId,
    });
  });
