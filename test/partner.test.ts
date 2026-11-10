import type { App } from '../src/app.js';
import { config } from '../src/common/config/index.js';
import { query, pool } from '../src/common/db/index.js';
import { LOGIN_MAX_FAILURES } from '../src/common/auth/constant.js';
import {
  api,
  closeDatabase,
  COOKIE,
  cookieOf,
  createApp,
  DEFAULT_EMAIL,
  firstSlotId,
  PASSWORD,
  prepareDatabase,
  resetDatabase,
  signUp,
} from './helpers.js';

const loginPartner = (app: App, email: string, password: string) =>
  api(app, { method: 'POST', url: '/api/partner/auth/login', payload: { email, password } });

describe('partner sign-up, login and status', () => {
  let app: App;

  beforeAll(async () => {
    await prepareDatabase();

    app = await createApp();
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await app.close();

    await closeDatabase();
  });

  it('lists cities and bookable slots with seats left', async () => {
    const cities = await api(app, { method: 'GET', url: '/api/partner/interview-cities' });
    const slots = await api(app, { method: 'GET', url: '/api/partner/interview-slots?cityKey=tampines' });

    expect(cities.json().map((city: { key: string }) => city.key)).toContain('tampines');
    expect(slots.statusCode).toBe(200);
    expect(slots.json()[0]).toMatchObject({ cityKey: 'tampines', capacity: config.slotCapacity, seatsLeft: config.slotCapacity });
    expect(slots.json()[0].id).toMatch(/^tampines_\d{4}-\d{2}-\d{2}_\d{2}:00$/);
  });

  it('creates the partner, books the slot and never returns the password', async () => {
    const response = await signUp(app, { singaporePhone: '+65 9123 4567' });
    const body = response.json();

    expect(response.statusCode).toBe(201);
    expect(body.partner).toMatchObject({
      name: 'Test Partner',
      email: DEFAULT_EMAIL,
      primaryPhone: '+9598760000',
      singaporePhone: '+6591234567',
      state: 'signed_up',
      stage: 'registered',
      verified: false,
      slotId: firstSlotId(),
    });
    expect(body.partner.onboarding.leadId).toMatch(/^lead-/);
    expect(JSON.stringify(body)).not.toContain(PASSWORD);
    expect(body.slot.id).toBe(firstSlotId());

    const slots = await api(app, { method: 'GET', url: '/api/partner/interview-slots?cityKey=tampines' });
    expect(slots.json()[0].seatsLeft).toBe(config.slotCapacity - 1);

    const audits = await query(pool, 'SELECT action FROM audit_logs ORDER BY id');
    expect(audits.map(row => row.action)).toEqual(['partner.signed_up', 'partner.lead_created']);
  });

  it('creates no lead without a Singapore number and rejects invalid ones', async () => {
    const without = await signUp(app);
    expect(without.json().partner.onboarding).toBeUndefined();
    expect(without.json().partner.hasSingaporePhone).toBe(false);

    const invalid = await signUp(app, { primaryPhone: '+95 9876 0001', singaporePhone: '+65 1234 5678' });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('INVALID_SINGAPORE_PHONE');
  });

  it('rejects a second sign-up with the same number, whatever the formatting, even when concurrent', async () => {
    const first = await signUp(app);
    const second = await signUp(app, { primaryPhone: '+95-9876-0000' });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('PHONE_ALREADY_REGISTERED');

    const [raceA, raceB] = await Promise.all([signUp(app, { primaryPhone: '+95 1111 2222' }), signUp(app, { primaryPhone: '+95 1111 2222' })]);
    expect([raceA.statusCode, raceB.statusCode].toSorted()).toEqual([201, 409]);
  });

  it('rejects a second sign-up with the same email, whatever the casing, even when concurrent', async () => {
    const first = await signUp(app);
    const second = await signUp(app, { primaryPhone: '+95 9876 0001', email: ` ${DEFAULT_EMAIL.toUpperCase()} ` });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('EMAIL_ALREADY_REGISTERED');

    const [raceA, raceB] = await Promise.all([
      signUp(app, { primaryPhone: '+95 1111 2222', email: 'race@example.com' }),
      signUp(app, { primaryPhone: '+95 1111 3333', email: 'race@example.com' }),
    ]);
    expect([raceA.statusCode, raceB.statusCode].toSorted()).toEqual([201, 409]);

    const partners = await query(pool, 'SELECT COUNT(*) AS count FROM partners');
    expect(partners[0].count).toBe(2);
  });

  it('validates the payload, the email, the city and the slot', async () => {
    const weak = await signUp(app, { password: 'short' });
    const email = await signUp(app, { email: 'not-an-email' });
    const city = await signUp(app, { interviewCity: 'nowhere', slotId: 'nowhere_2026-01-01_09:00' });
    const past = await signUp(app, { slotId: 'tampines_2020-01-01_09:00' });
    const referrer = await signUp(app, { source: 'recruiter' });

    expect(weak.statusCode).toBe(400);
    expect(weak.json().error.code).toBe('VALIDATION_FAILED');
    expect(email.statusCode).toBe(400);
    expect(email.json().error.code).toBe('VALIDATION_FAILED');
    expect(city.json().error.code).toBe('UNKNOWN_CITY');
    expect(past.json().error.code).toBe('SLOT_UNAVAILABLE');
    expect(referrer.json().error.code).toBe('REFERRER_REQUIRED');
  });

  it('fills a slot to capacity and gives the last seat to exactly one concurrent sign-up', async () => {
    const slotId = firstSlotId('bedok');
    const phones = Array.from({ length: config.slotCapacity - 1 }, (_, index) => `+95 2000 000${index}`);

    await phones.reduce(
      (chain, primaryPhone) => chain.then(() => signUp(app, { primaryPhone, interviewCity: 'bedok', slotId })),
      Promise.resolve<unknown>(undefined),
    );

    const [a, b] = await Promise.all([
      signUp(app, { primaryPhone: '+95 3000 0001', interviewCity: 'bedok', slotId }),
      signUp(app, { primaryPhone: '+95 3000 0002', interviewCity: 'bedok', slotId }),
    ]);
    expect([a.statusCode, b.statusCode].toSorted()).toEqual([201, 409]);

    const slots = await api(app, { method: 'GET', url: '/api/partner/interview-slots?cityKey=bedok' });
    expect(slots.json().map((slot: { id: string }) => slot.id)).not.toContain(slotId);
  });

  it('signs the partner in with email and password, case-insensitively, and shows their own status', async () => {
    await signUp(app);

    const login = await loginPartner(app, DEFAULT_EMAIL.toUpperCase(), PASSWORD);
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({ name: 'Test Partner', email: DEFAULT_EMAIL });

    const cookie = { [COOKIE.partner]: cookieOf(login, COOKIE.partner) };
    const me = await api(app, { method: 'GET', url: '/api/partner/me', cookie });
    expect(me.statusCode).toBe(200);
    expect(me.json().partner.stage).toBe('registered');
    expect(me.json().partner.email).toBe(DEFAULT_EMAIL);
    expect(me.json().slot.id).toBe(firstSlotId());

    const anonymous = await api(app, { method: 'GET', url: '/api/partner/me' });
    expect(anonymous.statusCode).toBe(401);
  });

  it('returns the same error for a wrong password and an unknown email, then locks after repeated failures', async () => {
    await signUp(app);

    const wrong = await loginPartner(app, DEFAULT_EMAIL, 'nope-nope');
    const unknown = await loginPartner(app, 'nobody@example.com', PASSWORD);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());

    await Array.from({ length: LOGIN_MAX_FAILURES }).reduce<Promise<unknown>>(
      chain => chain.then(() => loginPartner(app, DEFAULT_EMAIL, 'nope-nope')),
      Promise.resolve<unknown>(undefined),
    );

    const locked = await loginPartner(app, DEFAULT_EMAIL, PASSWORD);
    expect(locked.statusCode).toBe(423);
    expect(locked.json().error.code).toBe('LOGIN_LOCKED');
  });

  it('lets a signed-in partner change their password', async () => {
    await signUp(app);
    const login = await loginPartner(app, DEFAULT_EMAIL, PASSWORD);
    const cookie = { [COOKIE.partner]: cookieOf(login, COOKIE.partner) };

    const changed = await api(app, { method: 'POST', url: '/api/partner/change-password', cookie, payload: { currentPassword: PASSWORD, newPassword: 'NewPass123!' } });
    expect(changed.statusCode).toBe(204);

    const old = await loginPartner(app, DEFAULT_EMAIL, PASSWORD);
    const fresh = await loginPartner(app, DEFAULT_EMAIL, 'NewPass123!');
    expect(old.statusCode).toBe(401);
    expect(fresh.statusCode).toBe(200);
  });
});
