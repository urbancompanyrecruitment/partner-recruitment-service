import { randomUUID } from 'node:crypto';
import type { Actor } from '../../common/auth/index.js';
import { assertNotLocked, nextLoginFailure } from '../../common/auth/lockout.js';
import { piiChecksum } from '../../common/crypto/pii.js';
import { pool, withTransaction, type DbConnection } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { isValidPhone, isValidSingaporePhone, normalisePhone } from '../../common/phone/index.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import { bookSlot, findOfferedSlot, findPartnerSlot, getCity } from '../interview/index.js';
import { NAME_SEPARATOR, SOURCES_REQUIRING_REFERRER } from './constant.js';
import {
  PartnerCountry,
  PartnerState,
  type LoginInput,
  type PartnerRow,
  type PartnerStatus,
  type PartnerView,
  type RescheduleInput,
  type SignUpInput,
  type SignUpResult,
} from './interface.js';
import { syncLead } from './onboarding.js';
import { syncPartnerToSheet } from './sheet.js';
import {
  findPartnerById,
  findPartnerIdByChecksum,
  insertPartner,
  listPartnersByRegistrar,
  updateInterviewCity,
  updateLoginFailure,
  updateLoginSuccess,
} from './repository.js';
import { toPartnerView } from './view.js';

export const requirePartnerRow = async (db: DbConnection | typeof pool, partnerId: string): Promise<PartnerRow> => {
  const partner = await findPartnerById(db, partnerId);

  if (!partner) throw new AppError(ErrorCode.NotFound, { partnerId });

  return partner;
};

export const signUp = async (input: SignUpInput, registrar: Actor | undefined, requestId: string): Promise<SignUpResult> => {
  const primaryPhone = normalisePhone(input.primaryPhone);

  if (!isValidPhone(primaryPhone)) throw new AppError(ErrorCode.InvalidPhone);

  const singaporePhone = input.singaporePhone ? normalisePhone(input.singaporePhone) : undefined;

  if (singaporePhone && !isValidSingaporePhone(singaporePhone)) throw new AppError(ErrorCode.InvalidSingaporePhone);

  if (SOURCES_REQUIRING_REFERRER.includes(input.source) && !input.referrer) throw new AppError(ErrorCode.ReferrerRequired);

  const city = await getCity(input.interviewCity);
  const cityOffered = city && (input.country === PartnerCountry.Others || city.country === input.country);

  if (!city || !cityOffered) throw new AppError(ErrorCode.UnknownCity, { cityKey: input.interviewCity });

  const slot = await findOfferedSlot(input.slotId);

  if (!slot || slot.cityKey !== city.key) throw new AppError(ErrorCode.SlotUnavailable, { slotId: input.slotId });

  const phoneChecksum = piiChecksum(primaryPhone);
  const partnerId = randomUUID();
  const actor = registrar
    ? { actorType: ActorType.Recruiter, actorId: registrar.id }
    : { actorType: ActorType.Partner, actorId: partnerId };

  const result = await withCriticalSection([lockKey.phone(phoneChecksum), lockKey.slot(slot.id), lockKey.partner(partnerId)], async connection => {
    const existingByPhone = await findPartnerIdByChecksum(connection, phoneChecksum);

    if (existingByPhone) throw new AppError(ErrorCode.PhoneAlreadyRegistered);

    await withTransaction(connection, async () => {
      await insertPartner(connection, {
        id: partnerId,
        primaryPhone,
        singaporePhone,
        name: [input.firstName, input.lastName].join(NAME_SEPARATOR),
        lastName: input.lastName,
        country: input.country,
        city: input.city,
        nationality: input.nationality,
        age: input.age,
        source: input.source,
        referrer: input.referrer,
        registeredByRecruiterId: registrar?.id,
        comfortableWithDogs: input.comfortableWithDogs,
        deepCleaningExperience: input.deepCleaningExperience,
        cookingFrequency: input.cookingFrequency,
        interviewCity: city.key,
      });

      await bookSlot(connection, partnerId, slot);

      await recordAudit(connection, {
        ...actor,
        action: AuditAction.PartnerSignedUp,
        entityType: AuditEntityType.Partner,
        entityId: partnerId,
        data: { cityKey: city.key, slotId: slot.id, hasSingaporePhone: Boolean(singaporePhone), registeredByRecruiterId: registrar?.id },
        requestId,
      });
    });

    const created = await requirePartnerRow(connection, partnerId);

    if (singaporePhone) {
      await syncLead(connection, created, actor, requestId).catch((error: Error) => {
        logger.error({ method: 'signUp', partnerId, message: 'Lead creation failed at sign-up', error: error?.message || error?.stack });
      });
    }

    logger.info({
      method: 'signUp',
      partnerId,
      key_1: 'city',
      key_1_value: city.key,
      key_2: 'slot',
      key_2_value: slot.id,
      key_3: 'registered_by_recruiter',
      key_3_value: String(Boolean(registrar)),
    });

    const partner = await requirePartnerRow(connection, partnerId);

    return { partner: toPartnerView(partner, true), slot };
  });

  syncPartnerToSheet(partnerId).catch((error: Error) => {
    logger.error({ method: 'signUp', partnerId, message: 'Sheet sync failed after sign-up', error: error?.message || error?.stack });
  });

  return result;
};

export const login = async (input: LoginInput, requestId: string): Promise<PartnerView> => {
  const partnerId = await findPartnerIdByChecksum(pool, piiChecksum(normalisePhone(input.primaryPhone)));

  if (!partnerId) throw new AppError(ErrorCode.InvalidCredentials);

  return withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const partner = await requirePartnerRow(connection, partnerId);

    assertNotLocked(partner.login_locked_until);

    const matches = partner.last_name.toLowerCase() === input.lastName.toLowerCase();

    if (!matches) {
      const failure = nextLoginFailure(partner.failed_login_count);

      await updateLoginFailure(connection, partnerId, failure.failedCount, failure.lockedUntil);

      logger.info({ method: 'login', partnerId, key_1: 'failed_login_count', key_1_value: String(failure.failedCount) });

      throw new AppError(ErrorCode.InvalidCredentials);
    }

    await updateLoginSuccess(connection, partnerId);

    await recordAudit(connection, {
      action: AuditAction.PartnerLoggedIn,
      actorType: ActorType.Partner,
      actorId: partnerId,
      entityType: AuditEntityType.Partner,
      entityId: partnerId,
      requestId,
    });

    return toPartnerView(partner, true);
  });
};

export const getPartnerStatus = async (partnerId: string): Promise<PartnerStatus> => {
  const partner = await requirePartnerRow(pool, partnerId);
  const slot = await findPartnerSlot(pool, partnerId);

  return { partner: toPartnerView(partner, true), slot };
};

export const reschedule = async (partnerId: string, input: RescheduleInput, requestId: string): Promise<PartnerStatus> => {
  const city = await getCity(input.interviewCity);

  if (!city) throw new AppError(ErrorCode.UnknownCity, { cityKey: input.interviewCity });

  const slot = await findOfferedSlot(input.slotId);

  if (!slot || slot.cityKey !== city.key) throw new AppError(ErrorCode.SlotUnavailable, { slotId: input.slotId });

  return withCriticalSection([lockKey.slot(slot.id), lockKey.partner(partnerId)], async connection => {
    const partner = await requirePartnerRow(connection, partnerId);

    if (partner.state !== PartnerState.SignedUp) throw new AppError(ErrorCode.NotReschedulable, { state: partner.state });

    const cityOffered = partner.current_country === PartnerCountry.Others || city.country === partner.current_country;

    if (!cityOffered) throw new AppError(ErrorCode.UnknownCity, { cityKey: city.key });

    const current = await findPartnerSlot(connection, partnerId);

    if (current?.id === slot.id) return { partner: toPartnerView(partner, true), slot: current };

    await withTransaction(connection, async () => {
      await bookSlot(connection, partnerId, slot);

      await updateInterviewCity(connection, partnerId, city.key);

      await recordAudit(connection, {
        action: AuditAction.PartnerSlotRescheduled,
        actorType: ActorType.Partner,
        actorId: partnerId,
        entityType: AuditEntityType.Booking,
        entityId: partnerId,
        data: { from: current?.id, to: slot.id },
        requestId,
      });
    });

    logger.info({ method: 'reschedule', partnerId, key_1: 'from_slot', key_1_value: String(current?.id), key_2: 'to_slot', key_2_value: slot.id });

    return { partner: toPartnerView(await requirePartnerRow(connection, partnerId), true), slot: await findPartnerSlot(connection, partnerId) };
  });
};

export const listRegisteredPartners = async (recruiterId: string): Promise<PartnerView[]> =>
  (await listPartnersByRegistrar(pool, recruiterId)).map(row => toPartnerView(row, true));
