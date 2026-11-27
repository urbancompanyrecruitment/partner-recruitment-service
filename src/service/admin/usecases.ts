import { config } from '../../common/config/index.js';
import { toCsv, toPlainCsv } from '../../common/csv.js';
import { pool } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { SINGAPORE_DIAL_CODE } from '../../common/phone/constant.js';
import { isValidSingaporePhone, normalisePhone } from '../../common/phone/index.js';
import { listAllAggregators } from '../aggregator/index.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import { listRecruiterLockStats } from '../lock/index.js';
import {
  approveLead,
  listPartners,
  PartnerState,
  requirePartnerRow,
  syncLead,
  toPartnerView,
  TRANSITION_REASON,
  transitionPartner,
  updateSingaporePhone,
  VERIFIED_STATES,
  type PartnerListFilters,
  type PartnerView,
} from '../partner/index.js';
import { listRecruiters } from '../recruiter/index.js';
import { EXPORT_CSV_HEADERS, OPS_UPLOAD_CSV_HEADERS, OPS_UPLOAD_MAX_ROWS } from './constant.js';
import type { RecruiterWithStats } from './interface.js';

export const listRecruitersWithStats = async (): Promise<RecruiterWithStats[]> => {
  const recruiters = await listRecruiters();
  const stats = await listRecruiterLockStats();
  const aggregators = await listAllAggregators();

  return recruiters.map(recruiter => {
    const own = stats.find(item => item.recruiterId === recruiter.id);

    return {
      ...recruiter,
      locksAcquired: own?.locksAcquired ?? 0,
      placementsSubmitted: own?.placementsSubmitted ?? 0,
      aggregators: aggregators.filter(aggregator => aggregator.recruiterId === recruiter.id),
    };
  });
};

export const listAdminPartners = async (filters: PartnerListFilters): Promise<PartnerView[]> =>
  (await listPartners(pool, filters)).map(row => toPartnerView(row, true));

export const exportPartners = async (filters: PartnerListFilters, adminId: string, requestId: string): Promise<string> => {
  const partners = await listAdminPartners(filters);

  await recordAudit(pool, {
    action: AuditAction.PartnersExported,
    actorType: ActorType.Admin,
    actorId: adminId,
    entityType: AuditEntityType.Partner,
    entityId: 'export',
    data: { filters, count: partners.length },
    requestId,
  });

  return toCsv([
    EXPORT_CSV_HEADERS,
    ...partners.map(partner => [partner.name, `${partner.city}, ${partner.country}`, partner.primaryPhone]),
  ]);
};

export const exportPartnersForOps = async (filters: PartnerListFilters, adminId: string, requestId: string): Promise<string> => {
  const { cityKey, categoryKey, sourceType, experimentName } = config.opsLeadUpload;

  const partners = (await listAdminPartners(filters))
    .filter(partner => partner.state !== PartnerState.VerificationFailed)
    .map(partner => ({ name: partner.name, singaporePhone: partner.singaporePhone ?? '' }))
    .filter(partner => isValidSingaporePhone(partner.singaporePhone))
    .slice(0, OPS_UPLOAD_MAX_ROWS);

  await recordAudit(pool, {
    action: AuditAction.PartnersOpsUploadExported,
    actorType: ActorType.Admin,
    actorId: adminId,
    entityType: AuditEntityType.Partner,
    entityId: 'export',
    data: { filters, count: partners.length },
    requestId,
  });

  return toPlainCsv([
    OPS_UPLOAD_CSV_HEADERS,
    ...partners.map(partner => [
      partner.name,
      partner.singaporePhone.slice(SINGAPORE_DIAL_CODE.length),
      cityKey,
      categoryKey,
      sourceType,
      experimentName,
    ]),
  ]);
};

export const setSingaporePhone = (partnerId: string, raw: string, adminId: string, requestId: string): Promise<PartnerView> => {
  const singaporePhone = normalisePhone(raw);

  if (!isValidSingaporePhone(singaporePhone)) throw new AppError(ErrorCode.InvalidSingaporePhone);

  return withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const partner = await requirePartnerRow(connection, partnerId);
    const actor = { actorType: ActorType.Admin, actorId: adminId };

    if (partner.state === PartnerState.VerificationFailed) {
      throw new AppError(ErrorCode.InvalidTransition, { from: partner.state, change: 'singapore_phone' });
    }

    await updateSingaporePhone(connection, partnerId, singaporePhone);

    await recordAudit(connection, {
      ...actor,
      action: AuditAction.SingaporePhoneUpdated,
      entityType: AuditEntityType.Partner,
      entityId: partnerId,
      data: { hadSingaporePhone: Boolean(partner.singapore_phone_enc) },
      requestId,
    });

    await syncLead(connection, partner, actor, requestId);

    const withLead = await requirePartnerRow(connection, partnerId);

    if (VERIFIED_STATES.includes(withLead.state)) {
      const approved = await approveLead(connection, withLead, actor, requestId);

      logger.info({ method: 'setSingaporePhone', partnerId, key_1: 'lead_approved', key_1_value: String(approved) });
    }

    return toPartnerView(await requirePartnerRow(connection, partnerId), true);
  });
};

export const markJoined = (partnerId: string, adminId: string, requestId: string): Promise<PartnerView> =>
  withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const partner = await requirePartnerRow(connection, partnerId);

    await transitionPartner(
      connection,
      partner,
      PartnerState.Joined,
      { actorType: ActorType.Admin, actorId: adminId },
      TRANSITION_REASON.markedJoined,
      requestId,
    );

    return toPartnerView(await requirePartnerRow(connection, partnerId), true);
  });
