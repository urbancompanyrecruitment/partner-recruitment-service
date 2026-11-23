import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp, type App } from '../src/app.js';
import { runMigrations } from '../src/common/db/migrate.js';
import { execute, pool } from '../src/common/db/index.js';
import { config } from '../src/common/config/index.js';
import { AdminRole, CLI_CREATOR, createAdmin } from '../src/service/admin/index.js';
import { generateSlots, listActiveSlotDefinitions } from '../src/service/interview/index.js';
import { CookingFrequency, RecruitmentSource } from '../src/service/partner/interface.js';

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

export const ADMIN_EMAIL = 'admin@example.com';

export const COOKIE = { partner: 'partner_session', admin: 'admin_session', recruiter: 'recruiter_session' };

export const DEFAULT_PRIMARY_PHONE = '+95 9876 0000';

export const DEFAULT_FIRST_NAME = 'Test';

export const DEFAULT_LAST_NAME = 'Partner';

export const DEFAULT_AGGREGATOR = 'CleanSpace Services';

export const SLOT_CAPACITY = 4;

export const prepareDatabase = async (): Promise<void> => {
  await runMigrations(config.databaseUrl);
};

export const resetDatabase = async (): Promise<void> => {
  await execute(pool, `TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY`);
};

export const closeDatabase = (): Promise<void> => pool.end();

export const createApp = (): Promise<App> => buildApp();

export const firstSlotId = async (cityKey = 'singapore', offset = 0): Promise<string> => {
  const slots = generateSlots(await listActiveSlotDefinitions(pool)).filter(slot => slot.cityKey === cityKey);

  return slots[Math.min(offset, slots.length - 1)].id;
};

export const partnerDetails = async (overrides: Record<string, unknown> = {}) => {
  const interviewCity = typeof overrides.interviewCity === 'string' ? overrides.interviewCity : 'singapore';

  return {
    firstName: DEFAULT_FIRST_NAME,
    lastName: DEFAULT_LAST_NAME,
    primaryPhone: DEFAULT_PRIMARY_PHONE,
    country: 'Singapore',
    city: 'Singapore',
    nationality: 'Myanmar',
    age: 30,
    comfortableWithDogs: true,
    deepCleaningExperience: false,
    cookingFrequency: CookingFrequency.Daily,
    consent: true,
    interviewCity,
    ...overrides,
    slotId: overrides.slotId ?? (await firstSlotId(interviewCity)),
  };
};

export const signUpBody = async (overrides: Record<string, unknown> = {}) =>
  partnerDetails({ source: RecruitmentSource.TikTok, ...overrides });

export const cookieOf = (response: LightMyRequestResponse, name: string): string => {
  const cookie = response.cookies.find(item => item.name === name);

  if (!cookie) throw new Error(`Cookie ${name} not set`);

  return cookie.value;
};

export const api = (app: App, options: InjectOptions & { cookie?: Record<string, string> }) =>
  app.inject({ ...options, cookies: options.cookie });

export const signUp = async (app: App, overrides: Record<string, unknown> = {}) =>
  api(app, { method: 'POST', url: '/api/partner/sign-up', payload: await signUpBody(overrides) });

export const loginPartner = (app: App, primaryPhone: string, lastName: string) =>
  api(app, { method: 'POST', url: '/api/partner/auth/login', payload: { primaryPhone, lastName } });

export const partnerCookie = async (app: App, primaryPhone = DEFAULT_PRIMARY_PHONE, lastName = DEFAULT_LAST_NAME): Promise<Record<string, string>> => {
  const login = await loginPartner(app, primaryPhone, lastName);

  if (login.statusCode !== 200) throw new Error(`Partner login failed: ${login.body}`);

  return { [COOKIE.partner]: cookieOf(login, COOKIE.partner) };
};

export const createAdminAccount = async (
  app: App,
  email = ADMIN_EMAIL,
  role = AdminRole.SuperAdmin,
): Promise<{ id: string; cookie: Record<string, string>; temporaryPassword: string }> => {
  const created = await createAdmin({ email, name: 'Admin User', role }, CLI_CREATOR, 'test-setup');
  const login = await api(app, { method: 'POST', url: '/api/admin/auth/login', payload: { email, password: created.temporaryPassword } });

  if (login.statusCode !== 200) throw new Error(`Admin login failed: ${login.body}`);

  return { id: created.admin.id, cookie: { [COOKIE.admin]: cookieOf(login, COOKIE.admin) }, temporaryPassword: created.temporaryPassword };
};

export const loginAdmin = async (app: App, email = ADMIN_EMAIL, role = AdminRole.SuperAdmin): Promise<Record<string, string>> =>
  (await createAdminAccount(app, email, role)).cookie;

export const createRecruiterAccount = async (
  app: App,
  admin: Record<string, string>,
  email = 'alex@brightpath.sg',
): Promise<{ id: string; cookie: Record<string, string>; temporaryPassword: string }> => {
  const created = await api(app, {
    method: 'POST',
    url: '/api/admin/recruiters',
    cookie: admin,
    payload: { email, name: 'Alex Morgan', company: 'BrightPath Recruitment' },
  });

  if (created.statusCode !== 201) throw new Error(`Recruiter creation failed: ${created.body}`);

  const { recruiter, temporaryPassword } = created.json();
  const login = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email, password: temporaryPassword } });

  if (login.statusCode !== 200) throw new Error(`Recruiter login failed: ${login.body}`);

  return { id: recruiter.id, cookie: { [COOKIE.recruiter]: cookieOf(login, COOKIE.recruiter) }, temporaryPassword };
};

export const addAggregator = async (
  app: App,
  admin: Record<string, string>,
  recruiterId: string,
  name = DEFAULT_AGGREGATOR,
): Promise<string> => {
  const added = await api(app, { method: 'POST', url: `/api/admin/recruiters/${recruiterId}/aggregators`, cookie: admin, payload: { name } });

  if (added.statusCode !== 201) throw new Error(`Aggregator creation failed: ${added.body}`);

  return added.json().id;
};

export const importVerification = (app: App, admin: Record<string, string>, rows: Array<[string, string]>, fileName = 'verified.csv') =>
  api(app, {
    method: 'POST',
    url: '/api/admin/verification-imports',
    cookie: admin,
    payload: { fileName, rows: rows.map(([primaryPhone, verified]) => ({ primaryPhone, verified })) },
  });

export const createVerifiedPartner = async (
  app: App,
  admin: Record<string, string>,
  primaryPhone: string,
  singaporePhone = '+65 9123 4567',
  slotOffset = 0,
): Promise<string> => {
  const created = await signUp(app, { primaryPhone, singaporePhone, slotId: await firstSlotId('singapore', slotOffset) });

  if (created.statusCode !== 201) throw new Error(`Sign-up failed: ${created.body}`);

  const imported = await importVerification(app, admin, [[primaryPhone, 'true']]);

  if (imported.json().counts.accepted !== 1) throw new Error(`Verification failed: ${imported.body}`);

  return created.json().partner.id;
};
