import { config } from '../common/config/index.js';
import { NodeEnvironment } from '../common/config/interface.js';
import { hashPassword } from '../common/crypto/password.js';
import { encryptPii, piiChecksum } from '../common/crypto/pii.js';
import { execute, pool } from '../common/db/index.js';
import { logger } from '../common/logger.js';
import { dayjs, nowIn, WALL_CLOCK_FORMAT } from '../common/time.js';
import { SLOT_TIME_ZONE } from '../service/interview/index.js';
import { PartnerState } from '../service/partner/interface.js';
import { DEMO_PASSWORD, LOCK_PREFIX, PARTNER_PREFIX, RECRUITER_PREFIX, SEED_LOCKS, SEED_PARTNERS, SEED_RECRUITERS, seedId } from './seedData.js';

const TABLES = ['audit_logs', 'verification_import_rows', 'verification_imports', 'recruiter_locks', 'slot_bookings', 'partner_state_history', 'partners', 'recruiters'];

const STUB_LEAD_PREFIX = 'lead-seed-';

export const seedDatabase = async (): Promise<void> => {
  if (config.nodeEnv === NodeEnvironment.Production) throw new Error('Refusing to seed a production database');

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = nowIn(SLOT_TIME_ZONE);

  await execute(pool, 'SET FOREIGN_KEY_CHECKS = 0');

  await TABLES.reduce((chain, table) => chain.then(() => execute(pool, `TRUNCATE TABLE ${table}`)), Promise.resolve<unknown>(undefined));

  await execute(pool, 'SET FOREIGN_KEY_CHECKS = 1');

  await SEED_RECRUITERS.reduce(
    (chain, recruiter) =>
      chain.then(() =>
        execute(
          pool,
          `INSERT INTO recruiters (id, email, full_name, company, password_hash, created_by_admin_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'seed', NOW(3), NOW(3))`,
          [recruiter.id, recruiter.email, recruiter.name, recruiter.company, passwordHash],
        ),
      ),
    Promise.resolve<unknown>(undefined),
  );

  await SEED_PARTNERS.reduce(
    (chain, partner) =>
      chain.then(async () => {
        const id = seedId(PARTNER_PREFIX, partner.index);
        const createdAt = dayjs().subtract(partner.createdDaysAgo, 'day').toDate();
        const verified = partner.state !== PartnerState.SignedUp;

        await execute(
          pool,
          `INSERT INTO partners (
             id, primary_phone_enc, primary_phone_checksum, singapore_phone_enc, email_enc, email_checksum, password_hash, full_name, current_country, current_city,
             nationality, age, source, referrer_name, comfortable_with_dogs, deep_cleaning_experience, cooking_frequency,
             consent_accepted_at, consent_version, interview_city_key, state, lead_id, onboarding_journey_id, lead_created_at,
             approved_at, verified_at, verified_by_admin_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, 'seed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            encryptPii(partner.primaryPhone),
            piiChecksum(partner.primaryPhone),
            partner.singaporePhone ? encryptPii(partner.singaporePhone) : null,
            encryptPii(partner.email),
            piiChecksum(partner.email),
            passwordHash,
            partner.name,
            partner.country,
            partner.city,
            partner.nationality,
            partner.age,
            partner.source,
            partner.referrer ?? null,
            partner.cookingFrequency,
            createdAt,
            partner.interviewCity,
            partner.state,
            partner.hasLead ? `${STUB_LEAD_PREFIX}${partner.index}` : null,
            partner.hasLead ? `journey-seed-${partner.index}` : null,
            partner.hasLead ? createdAt : null,
            partner.approved ? createdAt : null,
            verified ? createdAt : null,
            verified ? 'seed' : null,
            createdAt,
            createdAt,
          ],
        );

        await execute(
          pool,
          'INSERT INTO slot_bookings (id, partner_id, city_key, starts_at, created_at) VALUES (?, ?, ?, ?, ?)',
          [
            seedId(PARTNER_PREFIX + 1, partner.index),
            id,
            partner.interviewCity,
            now.add(partner.slotDayOffset, 'day').hour(partner.slotHour).minute(0).second(0).millisecond(0).format(WALL_CLOCK_FORMAT),
            createdAt,
          ],
        );
      }),
    Promise.resolve(),
  );

  await SEED_LOCKS.reduce(
    (chain, lock) =>
      chain.then(() => {
        const lockedAt = dayjs().subtract(lock.lockedHoursAgo, 'hour').toDate();
        const releaseAt = dayjs().add(lock.releaseInHours, 'hour').toDate();

        return execute(
          pool,
          `INSERT INTO recruiter_locks (
             id, partner_id, locked_by, locked_at, lock_release_at, state, inactive_reason, inactive_at,
             employer_name, start_date, placement_recorded_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            seedId(LOCK_PREFIX, lock.index),
            seedId(PARTNER_PREFIX, lock.partnerIndex),
            seedId(RECRUITER_PREFIX, lock.recruiterIndex),
            lockedAt,
            releaseAt,
            lock.state,
            lock.inactiveReason ?? null,
            lock.inactiveReason ? lockedAt : null,
            lock.employerName ?? null,
            lock.startInDays === undefined ? null : dayjs().add(lock.startInDays, 'day').format('YYYY-MM-DD'),
            lock.employerName ? lockedAt : null,
            lockedAt,
            lockedAt,
          ],
        );
      }),
    Promise.resolve<unknown>(undefined),
  );

  logger.info({
    method: 'seedDatabase',
    key_1: 'partners',
    key_1_value: String(SEED_PARTNERS.length),
    key_2: 'recruiters',
    key_2_value: String(SEED_RECRUITERS.length),
    key_3: 'locks',
    key_3_value: String(SEED_LOCKS.length),
  });
};

const isMain = Boolean(process.argv[1]) && process.argv[1].endsWith('seed.ts');

if (isMain) {
  seedDatabase()
    .then(async () => {
      await pool.end();

      process.exit(0);
    })
    .catch(async (error: Error) => {
      logger.error({ method: 'seedDatabase', message: 'Seeding failed', error: error?.message || error?.stack });

      await pool.end();

      process.exit(1);
    });
}
