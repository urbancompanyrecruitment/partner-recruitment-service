import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../common/config/index.js';
import { NodeEnvironment } from '../common/config/interface.js';
import { hashPassword } from '../common/crypto/password.js';
import { encryptPii, piiChecksum } from '../common/crypto/pii.js';
import { execute, pool } from '../common/db/index.js';
import { logger } from '../common/logger.js';
import { dayjs, ISO_DATE_FORMAT, WALL_CLOCK_FORMAT } from '../common/time.js';
import { CLI_CREATOR } from '../service/admin/index.js';
import { PartnerNotificationType } from '../service/notification/index.js';
import { PartnerState } from '../service/partner/interface.js';
import {
  AGGREGATOR_PREFIX,
  DEMO_PASSWORD,
  LOCK_PREFIX,
  NOTIFICATION_PREFIX,
  PARTNER_PREFIX,
  RECRUITER_PREFIX,
  SEED_ADMINS,
  SEED_AGGREGATORS,
  SEED_LOCKS,
  SEED_PARTNERS,
  SEED_RECRUITERS,
  seedId,
} from './seedData.js';

const TABLES = [
  'audit_logs',
  'partner_notifications',
  'verification_import_rows',
  'verification_imports',
  'recruiter_locks',
  'recruiter_aggregators',
  'slot_bookings',
  'partner_state_history',
  'partners',
  'recruiters',
  'admins',
];

const STUB_LEAD_PREFIX = 'lead-seed-';

const SEED_TIME_ZONE = 'Asia/Singapore';

const SEED_ACTOR = 'seed';

const NAME_SEPARATOR = ' ';

const DECIDED_STATES = [PartnerState.Verified, PartnerState.Placed, PartnerState.Joined];

export const seedDatabase = async (): Promise<void> => {
  if (config.nodeEnv === NodeEnvironment.Production) throw new Error('Refusing to seed a production database');

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = dayjs().tz(SEED_TIME_ZONE);

  await execute(pool, `TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY`);

  await SEED_ADMINS.reduce(
    (chain, admin) =>
      chain.then(() =>
        execute(
          pool,
          `INSERT INTO admins (id, email, full_name, password_hash, role, created_by_admin_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, LOCALTIMESTAMP(3), LOCALTIMESTAMP(3))`,
          [admin.id, admin.email, admin.name, passwordHash, admin.role, CLI_CREATOR],
        ),
      ),
    Promise.resolve<unknown>(undefined),
  );

  await SEED_RECRUITERS.reduce(
    (chain, recruiter) =>
      chain.then(() =>
        execute(
          pool,
          `INSERT INTO recruiters (id, email, full_name, company, password_hash, status, created_by_admin_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL, LOCALTIMESTAMP(3), LOCALTIMESTAMP(3))`,
          [recruiter.id, recruiter.email, recruiter.name, recruiter.company, passwordHash, recruiter.status],
        ),
      ),
    Promise.resolve<unknown>(undefined),
  );

  await SEED_AGGREGATORS.reduce(
    (chain, aggregator) =>
      chain.then(() =>
        execute(
          pool,
          `INSERT INTO recruiter_aggregators (id, recruiter_id, name, created_by_admin_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, LOCALTIMESTAMP(3), LOCALTIMESTAMP(3))`,
          [seedId(AGGREGATOR_PREFIX, aggregator.index), seedId(RECRUITER_PREFIX, aggregator.recruiterIndex), aggregator.name, SEED_ACTOR],
        ),
      ),
    Promise.resolve<unknown>(undefined),
  );

  await SEED_PARTNERS.reduce(
    (chain, partner) =>
      chain.then(async () => {
        const id = seedId(PARTNER_PREFIX, partner.index);
        const createdAt = dayjs().subtract(partner.createdDaysAgo, 'day').toDate();
        const verified = DECIDED_STATES.includes(partner.state);
        const slotStart = now.add(partner.slotDayOffset, 'day').hour(partner.slotHour).minute(0).second(0).millisecond(0);

        await execute(
          pool,
          `INSERT INTO partners (
             id, primary_phone_enc, primary_phone_checksum, singapore_phone_enc,
             full_name, last_name, current_country, current_city,
             nationality, age, source, referrer_name, registered_by_recruiter_id,
             comfortable_with_dogs, deep_cleaning_experience, cooking_frequency,
             consent_accepted_at, consent_version, interview_city_key, state, lead_id, onboarding_journey_id, lead_created_at,
             approved_at, verified_at, verified_by_admin_id, hub_name, hub_updated_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE, ?, ?, 'seed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            encryptPii(partner.primaryPhone),
            piiChecksum(partner.primaryPhone),
            partner.singaporePhone ? encryptPii(partner.singaporePhone) : null,
            partner.name,
            partner.name.split(NAME_SEPARATOR).at(-1),
            partner.country,
            partner.city,
            partner.nationality,
            partner.age,
            partner.source,
            partner.referrer ?? null,
            partner.registeredByRecruiterIndex ? seedId(RECRUITER_PREFIX, partner.registeredByRecruiterIndex) : null,
            partner.cookingFrequency,
            createdAt,
            partner.interviewCity,
            partner.state,
            partner.hasLead ? `${STUB_LEAD_PREFIX}${partner.index}` : null,
            partner.hasLead ? `journey-seed-${partner.index}` : null,
            partner.hasLead ? createdAt : null,
            partner.approved ? createdAt : null,
            verified ? createdAt : null,
            verified || partner.state === PartnerState.VerificationFailed ? SEED_ACTOR : null,
            partner.hubName ?? null,
            partner.hubName ? createdAt : null,
            createdAt,
            createdAt,
          ],
        );

        await execute(
          pool,
          `INSERT INTO slot_bookings (id, partner_id, slot_id, city_key, starts_at, created_at)
           VALUES (?, ?, (SELECT id FROM interview_slots WHERE city_key = ? AND start_time = ?), ?, ?, ?)`,
          [
            seedId(PARTNER_PREFIX + 1, partner.index),
            id,
            partner.interviewCity,
            slotStart.format('HH:mm:ss'),
            partner.interviewCity,
            slotStart.format(WALL_CLOCK_FORMAT),
            createdAt,
          ],
        );

        if (!verified) return;

        await execute(pool, 'INSERT INTO partner_notifications (id, partner_id, type, data, created_at) VALUES (?, ?, ?, NULL, ?)', [
          seedId(NOTIFICATION_PREFIX, partner.index),
          id,
          PartnerNotificationType.Verified,
          createdAt,
        ]);
      }),
    Promise.resolve(),
  );

  await SEED_LOCKS.reduce(
    (chain, lock) =>
      chain.then(async () => {
        const lockedAt = dayjs().subtract(lock.lockedHoursAgo, 'hour').toDate();
        const aggregator = SEED_AGGREGATORS.find(item => item.index === lock.aggregatorIndex);
        const startDate = lock.startInDays === undefined ? null : dayjs().add(lock.startInDays, 'day').format(ISO_DATE_FORMAT);

        await execute(
          pool,
          `INSERT INTO recruiter_locks (
             id, partner_id, locked_by, origin, locked_at, lock_release_at, state, inactive_reason, inactive_at,
             aggregator_id, employer_name, start_date, placement_recorded_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            seedId(LOCK_PREFIX, lock.index),
            seedId(PARTNER_PREFIX, lock.partnerIndex),
            seedId(RECRUITER_PREFIX, lock.recruiterIndex),
            lock.origin,
            lockedAt,
            lock.releaseInHours === undefined ? null : dayjs().add(lock.releaseInHours, 'hour').toDate(),
            lock.state,
            lock.inactiveReason ?? null,
            lock.inactiveReason ? lockedAt : null,
            aggregator ? seedId(AGGREGATOR_PREFIX, aggregator.index) : null,
            aggregator?.name ?? null,
            startDate,
            aggregator ? lockedAt : null,
            lockedAt,
            lockedAt,
          ],
        );

        if (!aggregator || !startDate) return;

        await execute(pool, 'INSERT INTO partner_notifications (id, partner_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)', [
          seedId(NOTIFICATION_PREFIX + 1, lock.index),
          seedId(PARTNER_PREFIX, lock.partnerIndex),
          PartnerNotificationType.Placement,
          JSON.stringify({ aggregatorName: aggregator.name, startDate }),
          lockedAt,
        ]);
      }),
    Promise.resolve<unknown>(undefined),
  );

  logger.info({
    method: 'seedDatabase',
    key_1: 'partners',
    key_1_value: String(SEED_PARTNERS.length),
    key_2: 'recruiters',
    key_2_value: String(SEED_RECRUITERS.length),
    key_3: 'admins',
    key_3_value: String(SEED_ADMINS.length),
  });
};

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

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
