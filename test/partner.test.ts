import type { App } from '../src/buildApp.js';
import { execute, query, pool } from '../src/common/db/index.js';
import { LOGIN_MAX_FAILURES } from '../src/common/auth/constant.js';
import {
  api,
  closeDatabase,
  createApp,
  DEFAULT_LAST_NAME,
  DEFAULT_PRIMARY_PHONE,
  firstSlotId,
  importVerification,
  loginAdmin,
  loginPartner,
  partnerCookie,
  prepareDatabase,
  resetDatabase,
  signUp,
  SLOT_CAPACITY,
} from './helpers.js';

const cityKeys = async (app: App, country?: string): Promise<string[]> => {
  const response = await api(app, { method: 'GET', url: `/api/partner/interview-cities${country ? `?country=${country}` : ''}` });

  return response.json().map((city: { key: string }) => city.key);
};

const reschedule = (app: App, cookie: Record<string, string> | undefined, interviewCity: string, slotId: string) =>
  api(app, { method: 'POST', url: '/api/partner/reschedule', cookie, payload: { interviewCity, slotId } });

describe('partner sign-up, login, reschedule and status', () => {
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

  it('lists interview cities for the chosen country, and every city for Others', async () => {
    const singapore = await cityKeys(app, 'Singapore');
    const myanmar = await cityKeys(app, 'Myanmar');
    const others = await cityKeys(app, 'Others');
    const all = await cityKeys(app);

    expect(singapore).toEqual(['singapore']);
    expect(myanmar).toEqual(['yangon']);
    expect(others.toSorted()).toEqual([...singapore, ...myanmar].toSorted());
    expect(all).toEqual(others);

    const cities = await api(app, { method: 'GET', url: '/api/partner/interview-cities?country=Myanmar' });
    expect(cities.json().find((city: { key: string }) => city.key === 'yangon')).toMatchObject({
      country: 'Myanmar',
      name: 'Yangon',
      centre: 'Yangon Interview Centre',
      address: 'Ye Tagon Tower (Pang Hlaing Tower), Pann Hlaing St, Yangon, Myanmar',
      timeZone: 'Asia/Yangon',
    });

    const singaporeCities = await api(app, { method: 'GET', url: '/api/partner/interview-cities?country=Singapore' });
    expect(singaporeCities.json()).toEqual([
      expect.objectContaining({ key: 'singapore', centre: 'Singapore Interview Centre', address: '33 Maude Road #02-01, Singapore 208344' }),
    ]);

    const retired = await query(pool, 'SELECT DISTINCT city_key FROM interview_slots WHERE NOT is_active ORDER BY city_key');
    expect(retired.map(row => row.city_key)).toEqual(['ang-mo-kio', 'bedok', 'jurong-east', 'mandalay', 'tampines', 'woodlands']);
  });

  it('lists bookable slots from the slots table with seats left, in the time zone of the city', async () => {
    const singapore = await api(app, { method: 'GET', url: '/api/partner/interview-slots?cityKey=singapore' });
    const yangon = await api(app, { method: 'GET', url: '/api/partner/interview-slots?cityKey=yangon' });
    const unknown = await api(app, { method: 'GET', url: '/api/partner/interview-slots?cityKey=nowhere' });

    expect(singapore.statusCode).toBe(200);
    expect(singapore.json()[0]).toMatchObject({ cityKey: 'singapore', timeZone: 'Asia/Singapore', capacity: SLOT_CAPACITY, seatsLeft: SLOT_CAPACITY });
    expect(singapore.json()[0].id).toMatch(/^singapore_\d{4}-\d{2}-\d{2}_\d{2}:00$/);
    expect(singapore.json().map((slot: { startsAt: string }) => slot.startsAt)).toEqual(
      singapore.json().map((slot: { startsAt: string }) => slot.startsAt).toSorted(),
    );
    expect(yangon.json()[0]).toMatchObject({ cityKey: 'yangon', timeZone: 'Asia/Yangon' });
    expect(unknown.json().error.code).toBe('UNKNOWN_CITY');

    await execute(pool, 'UPDATE interview_slots SET is_active = FALSE WHERE city_key = ?', ['yangon']);

    const closed = await cityKeys(app, 'Myanmar');

    await execute(pool, 'UPDATE interview_slots SET is_active = TRUE WHERE city_key = ?', ['yangon']);

    expect(closed).toEqual([]);
  });

  it('creates the partner from the first and last name and books the slot', async () => {
    const response = await signUp(app, { firstName: '  Nwe   Nwe ', lastName: ' Yi ', singaporePhone: '+65 9123 4567' });
    const body = response.json();
    const slotId = await firstSlotId();

    expect(response.statusCode).toBe(201);
    expect(body.partner).toMatchObject({
      name: 'Nwe Nwe Yi',
      primaryPhone: '+9598760000',
      singaporePhone: '+6591234567',
      country: 'Singapore',
      state: 'signed_up',
      stage: 'registered',
      verified: false,
      slotId,
    });
    expect(body.partner.registeredBy).toBeUndefined();
    expect(body.partner.onboarding.leadId).toMatch(/^lead-/);
    expect(body.slot.id).toBe(slotId);

    const slots = await api(app, { method: 'GET', url: '/api/partner/interview-slots?cityKey=singapore' });
    expect(slots.json()[0].seatsLeft).toBe(SLOT_CAPACITY - 1);

    const bookings = await query(pool, 'SELECT b.city_key, s.city_key AS slot_city FROM slot_bookings b JOIN interview_slots s ON s.id = b.slot_id');
    expect(bookings).toEqual([{ city_key: 'singapore', slot_city: 'singapore' }]);

    const audits = await query(pool, 'SELECT action FROM audit_logs ORDER BY id');
    expect(audits.map(row => row.action)).toEqual(['partner.signed_up', 'partner.lead_created']);
  });

  it('stores the phones encrypted, keeps the last name for sign-in, and takes no email or password', async () => {
    const created = await signUp(app, { singaporePhone: '+65 9123 4567', email: 'partner@example.com', password: 'Secret123!' });
    expect(created.statusCode).toBe(201);
    expect(created.json().partner.email).toBeUndefined();
    expect(JSON.stringify(created.json())).not.toContain('Secret123!');

    const [row] = await query(
      pool,
      'SELECT primary_phone_enc, singapore_phone_enc, primary_phone_checksum, full_name, last_name, email_enc, email_checksum, password_hash FROM partners',
    );
    const stored = [row.primary_phone_enc, row.singapore_phone_enc].map(value => (value as Buffer).toString('latin1'));

    expect(stored.join('|')).not.toContain('98760000');
    expect(stored.join('|')).not.toContain('91234567');
    expect(row.primary_phone_checksum).toHaveLength(64);
    expect(row).toMatchObject({ full_name: 'Test Partner', last_name: 'Partner', email_enc: null, email_checksum: null, password_hash: null });
  });

  it('accepts Singapore, Myanmar and Others as the country and offers only the matching interview cities', async () => {
    const myanmar = await signUp(app, { country: 'Myanmar', city: 'Yangon', interviewCity: 'yangon' });
    const others = await signUp(app, { primaryPhone: '+66 9000 0001', country: 'Others', city: 'Bangkok', interviewCity: 'singapore' });
    const wrongCity = await signUp(app, { primaryPhone: '+95 9876 0003', country: 'Myanmar', city: 'Yangon', interviewCity: 'singapore' });
    const wrongCountry = await signUp(app, { primaryPhone: '+95 9876 0004', country: 'Thailand' });

    expect(myanmar.statusCode).toBe(201);
    expect(myanmar.json().partner).toMatchObject({ country: 'Myanmar', interviewCity: 'yangon' });
    expect(myanmar.json().slot.timeZone).toBe('Asia/Yangon');
    expect(others.statusCode).toBe(201);
    expect(others.json().partner).toMatchObject({ country: 'Others', interviewCity: 'singapore' });
    expect(wrongCity.statusCode).toBe(400);
    expect(wrongCity.json().error.code).toBe('UNKNOWN_CITY');
    expect(wrongCountry.json().error.code).toBe('VALIDATION_FAILED');
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

  it('validates the payload, the names, the city and the slot', async () => {
    const noLastName = await signUp(app, { lastName: '   ' });
    const noFirstName = await signUp(app, { firstName: undefined });
    const city = await signUp(app, { interviewCity: 'nowhere', slotId: 'nowhere_2026-01-01_09:00' });
    const past = await signUp(app, { slotId: 'singapore_2020-01-01_09:00' });
    const otherCity = await signUp(app, { slotId: await firstSlotId('yangon') });
    const referrer = await signUp(app, { source: 'recruiter' });

    expect(noLastName.statusCode).toBe(400);
    expect(noLastName.json().error.code).toBe('VALIDATION_FAILED');
    expect(noFirstName.json().error.code).toBe('VALIDATION_FAILED');
    expect(city.json().error.code).toBe('UNKNOWN_CITY');
    expect(past.json().error.code).toBe('SLOT_UNAVAILABLE');
    expect(otherCity.json().error.code).toBe('SLOT_UNAVAILABLE');
    expect(referrer.json().error.code).toBe('REFERRER_REQUIRED');
  });

  it('fills a slot to the capacity in the slots table and gives the last seat to exactly one concurrent sign-up', async () => {
    const slotId = await firstSlotId('singapore', 3);
    const phones = Array.from({ length: SLOT_CAPACITY - 1 }, (_, index) => `+95 2000 000${index}`);

    await phones.reduce(
      (chain, primaryPhone) => chain.then(() => signUp(app, { primaryPhone, slotId })),
      Promise.resolve<unknown>(undefined),
    );

    const [a, b] = await Promise.all([
      signUp(app, { primaryPhone: '+95 3000 0001', slotId }),
      signUp(app, { primaryPhone: '+95 3000 0002', slotId }),
    ]);
    expect([a.statusCode, b.statusCode].toSorted()).toEqual([201, 409]);

    const slots = await api(app, { method: 'GET', url: '/api/partner/interview-slots?cityKey=singapore' });
    expect(slots.json().map((slot: { id: string }) => slot.id)).not.toContain(slotId);
  });

  it('signs the partner in with the primary mobile and last name, whatever the formatting or casing, and shows their own status', async () => {
    await signUp(app, { firstName: 'Maria', lastName: 'Dela Cruz' });

    const login = await loginPartner(app, '+95-9876-0000', '  dela   CRUZ ');
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({ name: 'Maria Dela Cruz', primaryPhone: '+9598760000' });

    const cookie = await partnerCookie(app, DEFAULT_PRIMARY_PHONE, 'Dela Cruz');
    const me = await api(app, { method: 'GET', url: '/api/partner/me', cookie });
    expect(me.statusCode).toBe(200);
    expect(me.json().partner.stage).toBe('registered');
    expect(me.json().partner.primaryPhone).toBe('+9598760000');
    expect(me.json().slot.id).toBe(await firstSlotId());

    const byFirstName = await loginPartner(app, DEFAULT_PRIMARY_PHONE, 'Maria');
    const byFullName = await loginPartner(app, DEFAULT_PRIMARY_PHONE, 'Maria Dela Cruz');
    const byPassword = await api(app, { method: 'POST', url: '/api/partner/auth/login', payload: { primaryPhone: DEFAULT_PRIMARY_PHONE, password: 'Dela Cruz' } });
    expect(byFirstName.statusCode).toBe(401);
    expect(byFullName.statusCode).toBe(401);
    expect(byPassword.statusCode).toBe(400);

    const anonymous = await api(app, { method: 'GET', url: '/api/partner/me' });
    const changePassword = await api(app, { method: 'POST', url: '/api/partner/change-password', cookie, payload: { currentPassword: 'x', newPassword: 'NewPass123!' } });
    expect(anonymous.statusCode).toBe(401);
    expect(changePassword.statusCode).toBe(404);
  });

  it('returns the same error for a wrong last name and an unknown number, then locks after repeated failures', async () => {
    await signUp(app);

    const wrong = await loginPartner(app, DEFAULT_PRIMARY_PHONE, 'Someone');
    const unknown = await loginPartner(app, '+95 1234 5678', DEFAULT_LAST_NAME);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());

    await Array.from({ length: LOGIN_MAX_FAILURES }).reduce<Promise<unknown>>(
      chain => chain.then(() => loginPartner(app, DEFAULT_PRIMARY_PHONE, 'Someone')),
      Promise.resolve<unknown>(undefined),
    );

    const locked = await loginPartner(app, DEFAULT_PRIMARY_PHONE, DEFAULT_LAST_NAME);
    expect(locked.statusCode).toBe(423);
    expect(locked.json().error.code).toBe('LOGIN_LOCKED');
  });

  it('lets a signed-up partner move to another slot or city, even after the booked slot has passed', async () => {
    const created = await signUp(app, { country: 'Others', city: 'Bangkok' });
    const partnerId = created.json().partner.id;
    const cookie = await partnerCookie(app);
    const firstSlot = await firstSlotId('singapore');
    const laterSlot = await firstSlotId('singapore', 1);
    const yangonSlot = await firstSlotId('yangon');

    const moved = await reschedule(app, cookie, 'singapore', laterSlot);
    expect(moved.statusCode).toBe(200);
    expect(moved.json().slot.id).toBe(laterSlot);
    expect(moved.json().partner.slotId).toBe(laterSlot);

    const singapore = await api(app, { method: 'GET', url: '/api/partner/interview-slots?cityKey=singapore' });
    const seats = Object.fromEntries(singapore.json().map((slot: { id: string; seatsLeft: number }) => [slot.id, slot.seatsLeft]));
    expect(seats[firstSlot]).toBe(SLOT_CAPACITY);
    expect(seats[laterSlot]).toBe(SLOT_CAPACITY - 1);

    await execute(pool, 'UPDATE slot_bookings SET starts_at = starts_at - make_interval(days => 5) WHERE partner_id = ?', [partnerId]);

    const afterMissedSlot = await reschedule(app, cookie, 'yangon', yangonSlot);
    expect(afterMissedSlot.statusCode).toBe(200);
    expect(afterMissedSlot.json().partner).toMatchObject({ interviewCity: 'yangon', slotId: yangonSlot });

    const sameAgain = await reschedule(app, cookie, 'yangon', yangonSlot);
    expect(sameAgain.statusCode).toBe(200);

    const me = await api(app, { method: 'GET', url: '/api/partner/me', cookie });
    expect(me.json().slot).toMatchObject({ id: yangonSlot, cityKey: 'yangon' });

    const bookings = await query(pool, 'SELECT COUNT(*) AS total FROM slot_bookings WHERE partner_id = ?', [partnerId]);
    expect(Number(bookings[0].total)).toBe(1);

    const audits = await query(pool, "SELECT actor_type, entity_type, data FROM audit_logs WHERE action = 'partner.slot_rescheduled' ORDER BY id");
    expect(audits).toHaveLength(2);
    expect(audits[1]).toMatchObject({ actor_type: 'partner', entity_type: 'booking' });
    expect(audits[1].data.to).toBe(yangonSlot);
  });

  it('refuses a reschedule to a past, full or foreign slot, without a session, and once the partner is verified', async () => {
    await signUp(app, { country: 'Myanmar', city: 'Yangon', interviewCity: 'yangon' });

    const cookie = await partnerCookie(app);
    const fullSlot = await firstSlotId('yangon', 2);
    const phones = Array.from({ length: SLOT_CAPACITY }, (_, index) => `+95 2000 000${index}`);

    await phones.reduce(
      (chain, primaryPhone) => chain.then(() => signUp(app, { primaryPhone, country: 'Myanmar', city: 'Mandalay', interviewCity: 'yangon', slotId: fullSlot })),
      Promise.resolve<unknown>(undefined),
    );

    const anonymous = await reschedule(app, undefined, 'yangon', await firstSlotId('yangon', 1));
    const past = await reschedule(app, cookie, 'yangon', 'yangon_2020-01-01_09:00');
    const full = await reschedule(app, cookie, 'yangon', fullSlot);
    const otherCountry = await reschedule(app, cookie, 'singapore', await firstSlotId('singapore'));
    const unknownCity = await reschedule(app, cookie, 'nowhere', 'nowhere_2026-01-01_09:00');
    const mismatched = await reschedule(app, cookie, 'yangon', await firstSlotId('singapore', 1));

    expect(anonymous.statusCode).toBe(401);
    expect(past.json().error.code).toBe('SLOT_UNAVAILABLE');
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe('SLOT_UNAVAILABLE');
    expect(otherCountry.json().error.code).toBe('UNKNOWN_CITY');
    expect(unknownCity.json().error.code).toBe('UNKNOWN_CITY');
    expect(mismatched.json().error.code).toBe('SLOT_UNAVAILABLE');

    const admin = await loginAdmin(app);

    await importVerification(app, admin, [[DEFAULT_PRIMARY_PHONE, 'true']]);

    const afterVerification = await reschedule(app, cookie, 'yangon', await firstSlotId('yangon', 1));
    expect(afterVerification.statusCode).toBe(409);
    expect(afterVerification.json().error.code).toBe('NOT_RESCHEDULABLE');

    const me = await api(app, { method: 'GET', url: '/api/partner/me', cookie });
    expect(me.json().slot.id).toBe(await firstSlotId('yangon'));
  });
});
