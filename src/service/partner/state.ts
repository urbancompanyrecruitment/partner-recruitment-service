import type { DbConnection } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import { PARTNER_TRANSITIONS } from './constant.js';
import type { PartnerRow, PartnerState, TransitionActor } from './interface.js';
import { insertStateHistory, updatePartnerState } from './repository.js';

export const transitionPartner = async (
  connection: DbConnection,
  partner: PartnerRow,
  toState: PartnerState,
  actor: TransitionActor,
  reason: string,
  requestId: string,
): Promise<void> => {
  if (!PARTNER_TRANSITIONS[partner.state].includes(toState)) {
    throw new AppError(ErrorCode.InvalidTransition, { from: partner.state, to: toState });
  }

  const result = await updatePartnerState(connection, partner.id, partner.state, toState);

  if (result.affectedRows !== 1) throw new AppError(ErrorCode.InvalidTransition, { from: partner.state, to: toState });

  await insertStateHistory(connection, partner.id, partner.state, toState, actor.actorType, actor.actorId, reason);

  await recordAudit(connection, {
    action: AuditAction.PartnerStateChanged,
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: AuditEntityType.Partner,
    entityId: partner.id,
    data: { from: partner.state, to: toState, reason },
    requestId,
  });
};
