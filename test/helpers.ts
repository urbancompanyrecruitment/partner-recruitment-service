import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildApp, type App } from '../src/app.js';
import { runMigrations } from '../src/common/db/migrate.js';
import { execute, pool } from '../src/common/db/index.js';
import { config } from '../src/common/config/index.js';
import { generateSlots } from '../src/service/interview/index.js';
import { CookingFrequency, RecruitmentSource } from '../src/service/partner/interface.js';

const TABLES = ['audit_logs', 'verification_import_rows', 'verification_imports', 'recruiter_locks', 'slot_bookings', 'partner_state_history', 'partners', 'recruiters'];

export const ADMIN_EMAIL = 'business@urbancompany.com';

export const PASSWORD = 'Partner123!';

export const COOKIE = { partner: 'partner_session', admin: 'admin_session', recruiter: 'recruiter_session' };

export const DEFAULT_PRIMARY_PHONE = '+95 9876 0000';

const NON_DIGITS = /\D/g;

export const emailFor = (primaryPhone: string): string => `partner.${primaryPhone.replace(NON_DIGITS, '')}@example.com`;

export const DEFAULT_EMAIL = emailFor(DEFAULT_PRIMARY_PHONE);

export const prepareDatabase = async (): Promise<void> => {
  await runMigrations(config.databaseUrl);
};

export const resetDatabase = async (): Promise<void> => {
  await execute(pool, 'SET FOREIGN_KEY_CHECKS = 0');

  await TABLES.reduce((chain, table) => chain.then(() => execute(pool, `TRUNCATE TABLE ${table}`)), Promise.resolve<unknown>(undefined));

  await execute(pool, 'SET FOREIGN_KEY_CHECKS = 1');
};

export const closeDatabase = (): Promise<void> => pool.end();

export const createApp = (): Promise<App> => buildApp();

export const firstSlotId = (cityKey = 'tampines', offset = 0): string => {
  const slots = generateSlots().filter(slot => slot.cityKey === cityKey);

  return slots[Math.min(offset, slots.length - 1)].id;
};

export const signUpBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Test Partner',
  email: emailFor(typeof overrides.primaryPhone === 'string' ? overrides.primaryPhone : DEFAULT_PRIMARY_PHONE),
  primaryPhone: DEFAULT_PRIMARY_PHONE,
  password: PASSWORD,
  country: 'Myanmar',
  city: 'Yangon',
  nationality: 'Myanmar',
  age: 30,
  source: RecruitmentSource.TikTok,
  comfortableWithDogs: true,
  deepCleaningExperience: false,
  cookingFrequency: CookingFrequency.Daily,
  consent: true,
  interviewCity: 'tampines',
  slotId: firstSlotId(),
  ...overrides,
});

export const cookieOf = (response: LightMyRequestResponse, name: string): string => {
  const cookie = response.cookies.find(item => item.name === name);

  if (!cookie) throw new Error(`Cookie ${name} not set`);

  return cookie.value;
};

export const api = (app: App, options: InjectOptions & { cookie?: Record<string, string> }) =>
  app.inject({ ...options, cookies: options.cookie });

export const signUp = (app: App, overrides: Record<string, unknown> = {}) =>
  api(app, { method: 'POST', url: '/api/partner/sign-up', payload: signUpBody(overrides) });

export const loginAdmin = async (app: App, email = ADMIN_EMAIL): Promise<Record<string, string>> => {
  const response = await api(app, { method: 'POST', url: '/api/admin/auth/google', payload: { credential: email } });

  if (response.statusCode !== 200) throw new Error(`Admin login failed: ${response.body}`);

  return { [COOKIE.admin]: cookieOf(response, COOKIE.admin) };
};

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

export const createVerifiedPartner = async (
  app: App,
  admin: Record<string, string>,
  primaryPhone: string,
  singaporePhone = '+65 9123 4567',
  slotOffset = 0,
): Promise<string> => {
  const created = await signUp(app, { primaryPhone, singaporePhone, slotId: firstSlotId('tampines', slotOffset) });

  if (created.statusCode !== 201) throw new Error(`Sign-up failed: ${created.body}`);

  const imported = await api(app, {
    method: 'POST',
    url: '/api/admin/verification-imports',
    cookie: admin,
    payload: { fileName: 'verified.csv', primaryPhones: [primaryPhone] },
  });

  if (imported.json().counts.accepted !== 1) throw new Error(`Verification failed: ${imported.body}`);

  return created.json().partner.id;
};
