import { execute, type Queryable } from '../../common/db/index.js';
import type { AuditEntry } from './interface.js';

export const recordAudit = (db: Queryable, entry: AuditEntry): Promise<unknown> =>
  execute(
    db,
    `INSERT INTO audit_logs (action, actor_type, actor_id, entity_type, entity_id, data, request_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, LOCALTIMESTAMP(3))`,
    [
      entry.action,
      entry.actorType,
      entry.actorId ?? null,
      entry.entityType,
      entry.entityId,
      entry.data ? JSON.stringify(entry.data) : null,
      entry.requestId,
    ],
  );

export { ACTOR_TYPE_BY_ROLE, SYSTEM_REQUEST_ID } from './constant.js';
export { ActorType, AuditAction, AuditEntityType } from './interface.js';
