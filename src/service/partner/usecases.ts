import { randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { assertNotLocked, nextLoginFailure } from '../../common/auth/lockout.js';
import { hashPassword, verifyPassword } from '../../common/crypto/password.js';
import { piiChecksum } from '../../common/crypto/pii.js';
import { pool, withTransaction } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { isValidPhone, isValidSingaporePhone, normalisePhone } from '../../common/phone/index.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import { nowIn } from '../../common/time.js';
import { bookSlot, findOfferedSlot, findPartnerSlot, getCity, SLOT_TIME_ZONE } from '../interview/index.js';
import { SOURCES_REQUIRING_REFERRER } from './constant.js';
import type { ChangePasswordInput, LoginInput, PartnerRow, PartnerStatus, PartnerView, SignUpInput, SignUpResult } from './interface.js';
import { syncLead } from './onboarding.js';
import {
  findPartnerById,
  findPartnerIdByChecksum,
  findPartnerIdByEmailChecksum,
  insertPartner,
  updateLoginFailure,
  updateLoginSuccess,
  updatePasswordHash,
} from './repository.js';
import { toPartnerView } from './view.js';

export const requirePartnerRow = async (db: PoolConnection | typeof pool, partnerId: string): Promise<PartnerRow> => {
  const partner = await findPartnerById(db, partnerId);

  if (!partner) throw new AppError(ErrorCode.NotFound, { partnerId });

  return partner;
};

export const signUp = async (input: SignUpInput, requestId: string): Promise<SignUpResult> => {
  const primaryPhone = normalisePhone(input.primaryPhone);

  if (!isValidPhone(primaryPhone)) throw new AppError(ErrorCode.InvalidPhone);

  const singaporePhone = input.singaporePhone ? normalisePhone(input.singaporePhone) : undefined;

  if (singaporePhone && !isValidSingaporePhone(singaporePhone)) throw new AppError(ErrorCode.InvalidSingaporePhone);

  if (SOURCES_REQUIRING_REFERRER.includes(input.source) && !input.referrer) throw new AppError(ErrorCode.ReferrerRequired);

  const city = getCity(input.interviewCity);

  if (!city) throw new AppError(ErrorCode.UnknownCity, { cityKey: input.interviewCity });

  const slot = findOfferedSlot(input.slotId, nowIn(SLOT_TIME_ZONE));

  if (!slot || slot.cityKey !== city.key) throw new AppError(ErrorCode.SlotUnavailable, { slotId: input.slotId });

  const phoneChecksum = piiChecksum(primaryPhone);
  const emailChecksum = piiChecksum(input.email);
  const passwordHash = await hashPassword(input.password);
  const partnerId = randomUUID();
  const actor = { actorType: ActorType.Partner, actorId: partnerId };
  const keys = [lockKey.phone(phoneChecksum), lockKey.email(emailChecksum), lockKey.slot(slot.id), lockKey.partner(partnerId)];

  return withCriticalSection(keys, async connection => {
    const existingByPhone = await findPartnerIdByChecksum(connection, phoneChecksum);

    if (existingByPhone) throw new AppError(ErrorCode.PhoneAlreadyRegistered);

    const existingByEmail = await findPartnerIdByEmailChecksum(connection, emailChecksum);

    if (existingByEmail) throw new AppError(ErrorCode.EmailAlreadyRegistered);

    await withTransaction(connection, async () => {
      await insertPartner(connection, {
        id: partnerId,
        email: input.email,
        primaryPhone,
        singaporePhone,
        passwordHash,
        name: input.name,
        country: input.country,
        city: input.city,
        nationality: input.nationality,
        age: input.age,
        source: input.source,
        referrer: input.referrer,
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
        data: { cityKey: city.key, slotId: slot.id, hasSingaporePhone: Boolean(singaporePhone) },
        requestId,
      });
    });

    const created = await requirePartnerRow(connection, partnerId);

    if (singaporePhone) {
      await syncLead(connection, created, singaporePhone, actor, requestId).catch((error: Error) => {
        logger.error({ method: 'signUp', partnerId, message: 'Lead creation failed at sign-up', error: error?.message || error?.stack });
      });
    }

    logger.info({ method: 'signUp', partnerId, key_1: 'city', key_1_value: city.key, key_2: 'slot', key_2_value: slot.id });

    const partner = await requirePartnerRow(connection, partnerId);

    return { partner: toPartnerView(partner, true), slot };
  });
};

export const login = async (input: LoginInput, requestId: string): Promise<PartnerView> => {
  const partnerId = await findPartnerIdByEmailChecksum(pool, piiChecksum(input.email));

  if (!partnerId) throw new AppError(ErrorCode.InvalidCredentials);

  return withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const partner = await requirePartnerRow(connection, partnerId);

    assertNotLocked(partner.login_locked_until);

    const matches = await verifyPassword(partner.password_hash, input.password);

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

export const changePassword = (partnerId: string, input: ChangePasswordInput, requestId: string): Promise<void> =>
  withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const partner = await requirePartnerRow(connection, partnerId);
    const matches = await verifyPassword(partner.password_hash, input.currentPassword);

    if (!matches) throw new AppError(ErrorCode.InvalidCredentials);

    await updatePasswordHash(connection, partnerId, await hashPassword(input.newPassword));

    await recordAudit(connection, {
      action: AuditAction.PartnerPasswordChanged,
      actorType: ActorType.Partner,
      actorId: partnerId,
      entityType: AuditEntityType.Partner,
      entityId: partnerId,
      requestId,
    });
  });
