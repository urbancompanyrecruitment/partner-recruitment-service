import { randomUUID } from 'node:crypto';
import type { DbConnection } from '../../common/db/index.js';
import { AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import { JOURNEY_ID_PREFIX, LEAD_ID_PREFIX, LEAD_ID_SUFFIX_LENGTH } from './constant.js';
import type { PartnerRow, TransitionActor } from './interface.js';
import { updateLead, updateLeadApproved } from './repository.js';

export const syncLead = async (
  connection: DbConnection,
  partner: PartnerRow,
  actor: TransitionActor,
  requestId: string,
): Promise<void> => {
  if (partner.lead_id) return;

  const leadId = `${LEAD_ID_PREFIX}${randomUUID().slice(0, LEAD_ID_SUFFIX_LENGTH)}`;
  const journeyId = `${JOURNEY_ID_PREFIX}${randomUUID().slice(0, LEAD_ID_SUFFIX_LENGTH)}`;

  await updateLead(connection, partner.id, leadId, journeyId);

  await recordAudit(connection, {
    action: AuditAction.LeadCreated,
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: AuditEntityType.Partner,
    entityId: partner.id,
    data: { leadId },
    requestId,
  });
};

export const approveLead = async (
  connection: DbConnection,
  partner: PartnerRow,
  actor: TransitionActor,
  requestId: string,
): Promise<boolean> => {
  if (!partner.lead_id || partner.approved_at) return true;

  await updateLeadApproved(connection, partner.id);

  await recordAudit(connection, {
    action: AuditAction.LeadApproved,
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: AuditEntityType.Partner,
    entityId: partner.id,
    data: { leadId: partner.lead_id },
    requestId,
  });

  return true;
};
