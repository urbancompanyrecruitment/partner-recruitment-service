import { config } from '../../common/config/index.js';
import { toCsv } from '../../common/csv.js';
import { generateTemporaryPassword, hashPassword } from '../../common/crypto/password.js';
import { pool } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { isValidSingaporePhone, normalisePhone } from '../../common/phone/index.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import {
  listPartners,
  PartnerState,
  requirePartnerRow,
  syncLead,
  toPartnerView,
  TRANSITION_REASON,
  transitionPartner,
  updatePasswordHash,
  updateSingaporePhone,
  type PartnerListFilters,
  type PartnerView,
} from '../partner/index.js';
import { EMAIL_SEPARATOR, EXPORT_CSV_HEADERS } from './constant.js';
import { verifyGoogleCredential } from './google.js';
import type { AdminView, TemporaryPasswordResult } from './interface.js';

export const loginAdmin = async (credential: string): Promise<AdminView> => {
  const identity = await verifyGoogleCredential(credential);
  const domain = identity.email.split(EMAIL_SEPARATOR)[1] ?? '';

  if (!config.adminEmailDomains.includes(domain)) throw new AppError(ErrorCode.Forbidden, { domain });

  logger.info({ method: 'loginAdmin', key_1: 'admin_id', key_1_value: identity.id });

  return identity;
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

export const setSingaporePhone = (partnerId: string, raw: string, adminId: string, requestId: string): Promise<PartnerView> => {
  const singaporePhone = normalisePhone(raw);

  if (!isValidSingaporePhone(singaporePhone)) throw new AppError(ErrorCode.InvalidSingaporePhone);

  return withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const partner = await requirePartnerRow(connection, partnerId);
    const actor = { actorType: ActorType.Admin, actorId: adminId };

    await updateSingaporePhone(connection, partnerId, singaporePhone);

    await recordAudit(connection, {
      ...actor,
      action: AuditAction.SingaporePhoneUpdated,
      entityType: AuditEntityType.Partner,
      entityId: partnerId,
      data: { hadSingaporePhone: Boolean(partner.singapore_phone_enc) },
      requestId,
    });

    await syncLead(connection, partner, singaporePhone, actor, requestId);

    return toPartnerView(await requirePartnerRow(connection, partnerId), true);
  });
};

export const resetPartnerPassword = (partnerId: string, adminId: string, requestId: string): Promise<TemporaryPasswordResult> =>
  withCriticalSection([lockKey.partner(partnerId)], async connection => {
    await requirePartnerRow(connection, partnerId);

    const temporaryPassword = generateTemporaryPassword();

    await updatePasswordHash(connection, partnerId, await hashPassword(temporaryPassword));

    await recordAudit(connection, {
      action: AuditAction.PartnerPasswordReset,
      actorType: ActorType.Admin,
      actorId: adminId,
      entityType: AuditEntityType.Partner,
      entityId: partnerId,
      requestId,
    });

    return { temporaryPassword };
  });

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
