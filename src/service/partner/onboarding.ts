import type { DbConnection } from '../../common/db/index.js';
import { bulkApproveJourney, createLead } from '../../common/clients/onboarding.js';
import { AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import type { PartnerRow, TransitionActor } from './interface.js';
import { updateLead, updateLeadApproved } from './repository.js';

export const syncLead = async (
  connection: DbConnection,
  partner: PartnerRow,
  singaporePhone: string,
  actor: TransitionActor,
  requestId: string,
): Promise<void> => {
  if (partner.lead_id) return;

  const lead = await createLead({ phone: singaporePhone, partnerId: partner.id }, requestId);

  await updateLead(connection, partner.id, lead.leadId, lead.journeyId);

  await recordAudit(connection, {
    action: AuditAction.LeadCreated,
    actorType: actor.actorType,
    actorId: actor.actorId,
    entityType: AuditEntityType.Partner,
    entityId: partner.id,
    data: { leadId: lead.leadId },
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

  const approved = await bulkApproveJourney([partner.lead_id], actor.actorId ?? actor.actorType, requestId);

  if (!approved) return false;

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
