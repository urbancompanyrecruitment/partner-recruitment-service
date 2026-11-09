import type { ResultSetHeader } from 'mysql2/promise';
import { encryptPhone, phoneChecksum } from '../../common/crypto/phone.js';
import { execute, query, queryOne, type Queryable } from '../../common/db/index.js';
import { CONSENT_VERSION, PARTNER_SELECT, SEARCH_WILDCARD } from './constant.js';
import type { NewPartner, PartnerIdRow, PartnerListFilters, PartnerRow, PartnerState, SqlClause } from './interface.js';

const clause = (sql: string, ...params: unknown[]): SqlClause => ({ sql, params });

const filterClauses = (filters: PartnerListFilters): SqlClause[] =>
  [
    filters.state ? clause('p.state = ?', filters.state) : undefined,
    filters.cityKey ? clause('p.interview_city_key = ?', filters.cityKey) : undefined,
    filters.source ? clause('p.source = ?', filters.source) : undefined,
    filters.hasSingaporePhone === true ? clause('p.singapore_phone_enc IS NOT NULL') : undefined,
    filters.hasSingaporePhone === false ? clause('p.singapore_phone_enc IS NULL') : undefined,
    filters.q ? clause('p.full_name LIKE ?', `${SEARCH_WILDCARD}${filters.q}${SEARCH_WILDCARD}`) : undefined,
  ].filter((item): item is SqlClause => Boolean(item));

export const findPartnerIdByChecksum = async (db: Queryable, checksum: string): Promise<string | undefined> => {
  const row = await queryOne<PartnerIdRow>(db, 'SELECT id FROM partners WHERE primary_phone_checksum = ?', [checksum]);

  return row?.id;
};

export const findPartnerById = (db: Queryable, id: string): Promise<PartnerRow | undefined> =>
  queryOne<PartnerRow>(db, `${PARTNER_SELECT} WHERE p.id = ?`, [id]);

export const findPartnersByIds = (db: Queryable, ids: string[]): Promise<PartnerRow[]> =>
  ids.length ? query<PartnerRow>(db, `${PARTNER_SELECT} WHERE p.id IN (?)`, [ids]) : Promise.resolve([]);

export const listPartners = (db: Queryable, filters: PartnerListFilters): Promise<PartnerRow[]> => {
  const clauses = filterClauses(filters);
  const where = clauses.length ? ` WHERE ${clauses.map(item => item.sql).join(' AND ')}` : '';

  return query<PartnerRow>(
    db,
    `${PARTNER_SELECT}${where} ORDER BY p.created_at DESC`,
    clauses.flatMap(item => item.params),
  );
};

export const insertPartner = (db: Queryable, partner: NewPartner): Promise<ResultSetHeader> =>
  execute(
    db,
    `INSERT INTO partners (
       id, primary_phone_enc, primary_phone_checksum, singapore_phone_enc, password_hash,
       full_name, current_country, current_city, nationality, age, source, referrer_name,
       comfortable_with_dogs, deep_cleaning_experience, cooking_frequency,
       consent_accepted_at, consent_version, interview_city_key, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), ?, ?, NOW(3), NOW(3))`,
    [
      partner.id,
      encryptPhone(partner.primaryPhone),
      phoneChecksum(partner.primaryPhone),
      partner.singaporePhone ? encryptPhone(partner.singaporePhone) : null,
      partner.passwordHash,
      partner.name,
      partner.country,
      partner.city,
      partner.nationality,
      partner.age,
      partner.source,
      partner.referrer ?? null,
      partner.comfortableWithDogs ? 1 : 0,
      partner.deepCleaningExperience ? 1 : 0,
      partner.cookingFrequency,
      CONSENT_VERSION,
      partner.interviewCity,
    ],
  );

export const updatePartnerState = (db: Queryable, id: string, from: PartnerState, to: PartnerState): Promise<ResultSetHeader> =>
  execute(db, 'UPDATE partners SET state = ?, updated_at = NOW(3) WHERE id = ? AND state = ?', [to, id, from]);

export const insertStateHistory = (
  db: Queryable,
  partnerId: string,
  from: PartnerState,
  to: PartnerState,
  actorType: string,
  actorId: string | undefined,
  reason: string,
): Promise<ResultSetHeader> =>
  execute(
    db,
    `INSERT INTO partner_state_history (partner_id, from_state, to_state, actor_type, actor_id, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
    [partnerId, from, to, actorType, actorId ?? null, reason],
  );

export const updateLoginFailure = (db: Queryable, id: string, failedCount: number, lockedUntil: Date | null): Promise<ResultSetHeader> =>
  execute(db, 'UPDATE partners SET failed_login_count = ?, login_locked_until = ?, updated_at = NOW(3) WHERE id = ?', [
    failedCount,
    lockedUntil,
    id,
  ]);

export const updateLoginSuccess = (db: Queryable, id: string): Promise<ResultSetHeader> =>
  execute(
    db,
    'UPDATE partners SET failed_login_count = 0, login_locked_until = NULL, last_login_at = NOW(3), updated_at = NOW(3) WHERE id = ?',
    [id],
  );

export const updatePasswordHash = (db: Queryable, id: string, passwordHash: string): Promise<ResultSetHeader> =>
  execute(
    db,
    'UPDATE partners SET password_hash = ?, failed_login_count = 0, login_locked_until = NULL, updated_at = NOW(3) WHERE id = ?',
    [passwordHash, id],
  );

export const updateSingaporePhone = (db: Queryable, id: string, singaporePhone: string): Promise<ResultSetHeader> =>
  execute(db, 'UPDATE partners SET singapore_phone_enc = ?, updated_at = NOW(3) WHERE id = ?', [encryptPhone(singaporePhone), id]);

export const updateLead = (db: Queryable, id: string, leadId: string, journeyId: string): Promise<ResultSetHeader> =>
  execute(
    db,
    'UPDATE partners SET lead_id = ?, onboarding_journey_id = ?, lead_created_at = NOW(3), updated_at = NOW(3) WHERE id = ?',
    [leadId, journeyId, id],
  );

export const updateVerified = (db: Queryable, id: string, adminId: string, importId: string): Promise<ResultSetHeader> =>
  execute(
    db,
    `UPDATE partners SET verified_at = NOW(3), approved_at = NOW(3), verified_by_admin_id = ?, verification_import_id = ?, updated_at = NOW(3)
     WHERE id = ?`,
    [adminId, importId, id],
  );
