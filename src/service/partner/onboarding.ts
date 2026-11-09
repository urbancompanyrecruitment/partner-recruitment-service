import type { PoolConnection } from 'mysql2/promise';
import { createLead } from '../../common/clients/onboarding.js';
import { AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import type { PartnerRow, TransitionActor } from './interface.js';
import { updateLead } from './repository.js';

export const syncLead = async (
  connection: PoolConnection,
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
