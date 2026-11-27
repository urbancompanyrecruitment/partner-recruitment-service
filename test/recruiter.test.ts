import type { App } from '../src/buildApp.js';
import { execute, pool, query } from '../src/common/db/index.js';
import { deactivateExpiredLocks } from '../src/service/lock/index.js';
import {
  addAggregator,
  api,
  closeDatabase,
  COOKIE,
  cookieOf,
  createApp,
  createRecruiterAccount,
  createVerifiedPartner,
  DEFAULT_AGGREGATOR,
  DEFAULT_PRIMARY_PHONE,
  importVerification,
  loginAdmin,
  partnerCookie,
  partnerDetails,
  prepareDatabase,
  resetDatabase,
  signUp,
} from './helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const LOCK_DAYS = 3;

const TOMORROW = new Date(Date.now() + DAY_MS).toISOString().slice(0, 10);

const REGISTERED_PHONE = '+95 7000 0001';

describe('recruiter locks, registrations and placements', () => {
  let app: App;
  let admin: Record<string, string>;
  let alex: Awaited<ReturnType<typeof createRecruiterAccount>>;
  let jamie: Awaited<ReturnType<typeof createRecruiterAccount>>;
  let alexAggregator: string;
  let jamieAggregator: string;
  let partnerId: string;

  const placement = (cookie: Record<string, string>, aggregatorId: string, startDate = TOMORROW, id = partnerId) =>
    api(app, { method: 'POST', url: `/api/recruiter/partners/${id}/placement`, cookie, payload: { aggregatorId, startDate } });

  const lock = (cookie: Record<string, string>, id = partnerId) =>
    api(app, { method: 'POST', url: `/api/recruiter/partners/${id}/lock`, cookie });

  const registerPartner = async (cookie: Record<string, string>, overrides: Record<string, unknown> = {}) =>
    api(app, {
      method: 'POST',
      url: '/api/recruiter/partners',
      cookie,
      payload: await partnerDetails({ primaryPhone: REGISTERED_PHONE, firstName: 'Khin', lastName: 'Myo', ...overrides }),
    });

  beforeAll(async () => {
    await prepareDatabase();

    app = await createApp();
  });

  beforeEach(async () => {
    await resetDatabase();

    admin = await loginAdmin(app);
    alex = await createRecruiterAccount(app, admin, 'alex@brightpath.sg');
    jamie = await createRecruiterAccount(app, admin, 'jamie@horizon.sg');
    alexAggregator = await addAggregator(app, admin, alex.id);
    jamieAggregator = await addAggregator(app, admin, jamie.id, 'Horizon Staffing');
    partnerId = await createVerifiedPartner(app, admin, DEFAULT_PRIMARY_PHONE);
  });

  afterAll(async () => {
    await app.close();

    await closeDatabase();
  });

  it('signs suspended recruiters in to see their status but keeps every feature closed', async () => {
    const me = await api(app, { method: 'GET', url: '/api/recruiter/auth/me', cookie: alex.cookie });
    expect(me.json()).toMatchObject({ email: 'alex@brightpath.sg', company: 'BrightPath Recruitment' });

    await api(app, { method: 'PUT', url: `/api/admin/recruiters/${alex.id}/status`, cookie: admin, payload: { status: 'suspended' } });

    const afterSuspension = await api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: alex.cookie });
    expect(afterSuspension.statusCode).toBe(403);
    expect(afterSuspension.json().error.code).toBe('RECRUITER_SUSPENDED');

    const login = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'alex@brightpath.sg', password: alex.temporaryPassword } });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({ status: 'suspended', active: false });

    const suspendedCookie = { [COOKIE.recruiter]: cookieOf(login, COOKIE.recruiter) };
    const meWhileSuspended = await api(app, { method: 'GET', url: '/api/recruiter/auth/me', cookie: suspendedCookie });
    expect(meWhileSuspended.json()).toMatchObject({ status: 'suspended', active: false });

    const lockWhileSuspended = await api(app, { method: 'GET', url: '/api/recruiter/locks', cookie: suspendedCookie });
    expect(lockWhileSuspended.json().error.code).toBe('RECRUITER_SUSPENDED');

    const wrongPassword = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'alex@brightpath.sg', password: 'wrong-password' } });
    expect(wrongPassword.statusCode).toBe(401);

    const wrong = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'jamie@horizon.sg', password: 'wrong' } });
    expect(wrong.statusCode).toBe(401);
  });

  it('lets a recruiter request an account that stays locked out of every feature until an admin approves it', async () => {
    const details = { email: 'Priya@SwiftStaff.sg', name: 'Priya Nair', company: 'SwiftStaff Agency', password: 'Recruiter123!' };
    const requested = await api(app, { method: 'POST', url: '/api/recruiter/sign-up', payload: details });
    expect(requested.statusCode).toBe(201);
    expect(requested.json()).toMatchObject({ email: 'priya@swiftstaff.sg', company: 'SwiftStaff Agency', status: 'pending', active: false, selfRegistered: true });
    expect(JSON.stringify(requested.json())).not.toContain('Recruiter123!');

    const priya = { [COOKIE.recruiter]: cookieOf(requested, COOKIE.recruiter) };
    const duplicate = await api(app, { method: 'POST', url: '/api/recruiter/sign-up', payload: details });
    const weak = await api(app, { method: 'POST', url: '/api/recruiter/sign-up', payload: { ...details, email: 'other@swiftstaff.sg', password: 'short' } });
    expect(duplicate.statusCode).toBe(409);
    expect(weak.json().error.code).toBe('VALIDATION_FAILED');

    const me = await api(app, { method: 'GET', url: '/api/recruiter/auth/me', cookie: priya });
    expect(me.json()).toMatchObject({ status: 'pending', active: false });

    const blocked = await Promise.all([
      api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: priya }),
      api(app, { method: 'GET', url: '/api/recruiter/locks', cookie: priya }),
      lock(priya),
      api(app, { method: 'GET', url: `/api/recruiter/partners/${partnerId}`, cookie: priya }),
      registerPartner(priya),
      api(app, { method: 'GET', url: '/api/recruiter/partners/registered', cookie: priya }),
      api(app, { method: 'GET', url: '/api/recruiter/aggregators', cookie: priya }),
    ]);
    expect(blocked.map(response => response.statusCode)).toEqual(blocked.map(() => 403));
    expect(blocked.map(response => response.json().error.code)).toEqual(blocked.map(() => 'RECRUITER_PENDING_APPROVAL'));

    const loginWhilePending = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'priya@swiftstaff.sg', password: 'Recruiter123!' } });
    expect(loginWhilePending.statusCode).toBe(200);
    expect(loginWhilePending.json().status).toBe('pending');

    const requests = await api(app, { method: 'GET', url: '/api/admin/recruiters', cookie: admin });
    const request = requests.json().find((recruiter: { email: string }) => recruiter.email === 'priya@swiftstaff.sg');
    expect(request).toMatchObject({ status: 'pending', selfRegistered: true, locksAcquired: 0, placementsSubmitted: 0, aggregators: [] });

    const approved = await api(app, { method: 'PUT', url: `/api/admin/recruiters/${request.id}/status`, cookie: admin, payload: { status: 'active' } });
    expect(approved.json()).toMatchObject({ status: 'active', active: true });
    expect(approved.json().reviewedAt).toBeTruthy();

    const available = await api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: priya });
    const aggregators = await api(app, { method: 'GET', url: '/api/recruiter/aggregators', cookie: priya });
    expect(available.statusCode).toBe(200);
    expect(available.json()).toHaveLength(1);
    expect(aggregators.json()).toEqual([]);

    const audits = await query(pool, "SELECT action, actor_type FROM audit_logs WHERE entity_id = ? AND action IN ('recruiter.signed_up', 'recruiter.status_changed') ORDER BY id", [request.id]);
    expect(audits).toEqual([
      { action: 'recruiter.signed_up', actor_type: 'recruiter' },
      { action: 'recruiter.status_changed', actor_type: 'admin' },
    ]);
  });

  it('signs a rejected recruiter out and keeps them out until an admin approves the request after all', async () => {
    const requested = await api(app, { method: 'POST', url: '/api/recruiter/sign-up', payload: { email: 'sam@agency.sg', name: 'Sam Tan', company: 'Agency', password: 'Recruiter123!' } });
    const sam = { [COOKIE.recruiter]: cookieOf(requested, COOKIE.recruiter) };
    const samId = requested.json().id;

    const rejected = await api(app, { method: 'PUT', url: `/api/admin/recruiters/${samId}/status`, cookie: admin, payload: { status: 'rejected' } });
    expect(rejected.json()).toMatchObject({ status: 'rejected', active: false });

    const me = await api(app, { method: 'GET', url: '/api/recruiter/auth/me', cookie: sam });
    const login = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'sam@agency.sg', password: 'Recruiter123!' } });
    expect(me.statusCode).toBe(403);
    expect(me.json().error.code).toBe('RECRUITER_REJECTED');
    expect(login.statusCode).toBe(403);
    expect(login.json().error.code).toBe('RECRUITER_REJECTED');

    const suspendRejected = await api(app, { method: 'PUT', url: `/api/admin/recruiters/${samId}/status`, cookie: admin, payload: { status: 'suspended' } });
    expect(suspendRejected.statusCode).toBe(409);

    await api(app, { method: 'PUT', url: `/api/admin/recruiters/${samId}/status`, cookie: admin, payload: { status: 'active' } });

    const back = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'sam@agency.sg', password: 'Recruiter123!' } });
    expect(back.statusCode).toBe(200);
    expect(back.json().status).toBe('active');
  });

  it('lets a signed-in recruiter change their password', async () => {
    const wrongCurrent = await api(app, { method: 'POST', url: '/api/recruiter/change-password', cookie: alex.cookie, payload: { currentPassword: 'not-my-password', newPassword: 'Recruiter123!' } });
    expect(wrongCurrent.statusCode).toBe(400);
    expect(wrongCurrent.json().error.code).toBe('CURRENT_PASSWORD_INCORRECT');

    const anonymous = await api(app, { method: 'POST', url: '/api/recruiter/change-password', payload: { currentPassword: alex.temporaryPassword, newPassword: 'Recruiter123!' } });
    expect(anonymous.statusCode).toBe(401);

    const changed = await api(app, { method: 'POST', url: '/api/recruiter/change-password', cookie: alex.cookie, payload: { currentPassword: alex.temporaryPassword, newPassword: 'Recruiter123!' } });
    expect(changed.statusCode).toBe(204);

    const old = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'alex@brightpath.sg', password: alex.temporaryPassword } });
    const fresh = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'alex@brightpath.sg', password: 'Recruiter123!' } });
    expect(old.statusCode).toBe(401);
    expect(fresh.statusCode).toBe(200);

    const audits = await query(pool, "SELECT actor_id FROM audit_logs WHERE action = 'recruiter.password_changed'");
    expect(audits.map(row => row.actor_id)).toEqual([alex.id]);
  });

  it('shows verified, unlocked partners without phone numbers', async () => {
    await signUp(app, { primaryPhone: '+95 5555 0000' });

    const available = await api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: alex.cookie });
    expect(available.statusCode).toBe(200);
    expect(available.json()).toHaveLength(1);
    expect(available.json()[0]).toMatchObject({ id: partnerId, verified: true, hasSingaporePhone: true });
    expect(available.json()[0].primaryPhone).toBeUndefined();
    expect(JSON.stringify(available.json())).not.toContain('+95');

    const thailand = await api(app, { method: 'GET', url: '/api/recruiter/partners/available?country=Thailand', cookie: alex.cookie });
    expect(thailand.json()).toHaveLength(0);
  });

  it('locks a partner for three days for exactly one of two concurrent recruiters and reveals the numbers to the owner', async () => {
    const [a, b] = await Promise.all([lock(alex.cookie), lock(jamie.cookie)]);
    const statuses = [a.statusCode, b.statusCode].toSorted();
    expect(statuses).toEqual([200, 409]);

    const winner = a.statusCode === 200 ? alex : jamie;
    const loser = a.statusCode === 200 ? jamie : alex;
    const won = a.statusCode === 200 ? a : b;
    expect(won.json().partner.primaryPhone).toBe('+9598760000');
    expect(won.json().partner.singaporePhone).toBe('+6591234567');
    expect(won.json().lock).toMatchObject({ state: 'active', origin: 'recruiter' });
    expect(Date.parse(won.json().lock.lockReleaseAt) - Date.parse(won.json().lock.lockedAt)).toBe(LOCK_DAYS * DAY_MS);

    const again = await lock(winner.cookie);
    expect(again.json().lock.id).toBe(won.json().lock.id);

    const viewByLoser = await api(app, { method: 'GET', url: `/api/recruiter/partners/${partnerId}`, cookie: loser.cookie });
    expect(viewByLoser.statusCode).toBe(403);

    const viewByWinner = await api(app, { method: 'GET', url: `/api/recruiter/partners/${partnerId}`, cookie: winner.cookie });
    expect(viewByWinner.json().partner.primaryPhone).toBe('+9598760000');

    const available = await api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: loser.cookie });
    expect(available.json()).toHaveLength(0);

    const reveals = await query(pool, "SELECT actor_id FROM audit_logs WHERE action = 'phone.revealed'");
    expect(reveals.length).toBe(2);
    expect(reveals.every(row => row.actor_id === winner.id)).toBe(true);
  });

  it('records a placement with one of the recruiter aggregators for the lock owner only, moving the partner to placed', async () => {
    await lock(alex.cookie);

    const byOther = await placement(jamie.cookie, jamieAggregator);
    expect(byOther.statusCode).toBe(403);

    const past = await placement(alex.cookie, alexAggregator, '2020-01-01');
    expect(past.json().error.code).toBe('INVALID_START_DATE');

    const freeText = await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/placement`, cookie: alex.cookie, payload: { employerName: 'CleanSpace', startDate: TOMORROW } });
    expect(freeText.statusCode).toBe(400);
    expect(freeText.json().error.code).toBe('VALIDATION_FAILED');

    const placed = await placement(alex.cookie, alexAggregator);
    expect(placed.statusCode).toBe(200);
    expect(placed.json()).toMatchObject({ state: 'inactive', inactiveReason: 'placed', aggregatorId: alexAggregator, employerName: DEFAULT_AGGREGATOR, startDate: TOMORROW });

    const mine = await api(app, { method: 'GET', url: '/api/recruiter/locks', cookie: alex.cookie });
    expect(mine.json()).toHaveLength(1);
    expect(mine.json()[0].partner).toMatchObject({ id: partnerId, state: 'placed', stage: 'placed' });

    const again = await placement(alex.cookie, alexAggregator);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('LOCK_EXPIRED');

    const joined = await api(app, { method: 'POST', url: `/api/admin/partners/${partnerId}/mark-joined`, cookie: admin });
    expect(joined.json().state).toBe('joined');

    const locks = await api(app, { method: 'GET', url: '/api/admin/locks', cookie: admin });
    expect(locks.json()[0]).toMatchObject({ partnerName: 'Test Partner', recruiterName: 'Alex Morgan', employerName: DEFAULT_AGGREGATOR, aggregatorId: alexAggregator });
  });

  it('accepts only an aggregator the admins added to that recruiter', async () => {
    const partnerState = async () => (await query(pool, 'SELECT state FROM partners WHERE id = ?', [partnerId]))[0].state;

    await lock(alex.cookie);

    const own = await api(app, { method: 'GET', url: '/api/recruiter/aggregators', cookie: alex.cookie });
    expect(own.json().map((aggregator: { id: string; name: string }) => [aggregator.id, aggregator.name])).toEqual([[alexAggregator, DEFAULT_AGGREGATOR]]);

    const ofAnotherRecruiter = await placement(alex.cookie, jamieAggregator);
    const unknown = await placement(alex.cookie, '00000000-0000-4000-8000-000000000000');
    expect(ofAnotherRecruiter.statusCode).toBe(400);
    expect(ofAnotherRecruiter.json().error.code).toBe('UNKNOWN_AGGREGATOR');
    expect(unknown.json().error.code).toBe('UNKNOWN_AGGREGATOR');

    await api(app, { method: 'DELETE', url: `/api/admin/recruiters/${alex.id}/aggregators/${alexAggregator}`, cookie: admin });

    const removed = await placement(alex.cookie, alexAggregator);
    expect(removed.json().error.code).toBe('UNKNOWN_AGGREGATOR');
    expect(await partnerState()).toBe('verified');

    const second = await addAggregator(app, admin, alex.id, 'HomeCare Collective');
    const placed = await placement(alex.cookie, second);
    expect(placed.json()).toMatchObject({ employerName: 'HomeCare Collective', aggregatorId: second });
    expect(await partnerState()).toBe('placed');
  });

  it('refuses a placement unless the caller holds the active, unexpired lock', async () => {
    const partnerState = async () => (await query(pool, 'SELECT state FROM partners WHERE id = ?', [partnerId]))[0].state;

    const neverLocked = await placement(alex.cookie, alexAggregator);
    expect(neverLocked.statusCode).toBe(409);
    expect(neverLocked.json().error.code).toBe('LOCK_EXPIRED');

    const locked = await lock(alex.cookie);

    const byOther = await placement(jamie.cookie, jamieAggregator);
    expect(byOther.statusCode).toBe(403);
    expect(byOther.json().error.code).toBe('NOT_LOCK_OWNER');

    await execute(pool, 'UPDATE recruiter_locks SET lock_release_at = LOCALTIMESTAMP(3) - make_interval(mins => 1) WHERE id = ?', [locked.json().lock.id]);

    const pastReleaseTime = await placement(alex.cookie, alexAggregator);
    expect(pastReleaseTime.statusCode).toBe(409);
    expect(pastReleaseTime.json().error.code).toBe('LOCK_EXPIRED');

    await deactivateExpiredLocks();

    const inactive = await placement(alex.cookie, alexAggregator);
    expect(inactive.statusCode).toBe(409);
    expect(inactive.json().error.code).toBe('LOCK_EXPIRED');
    expect(await partnerState()).toBe('verified');

    await lock(jamie.cookie);

    const byFormerOwner = await placement(alex.cookie, alexAggregator);
    expect(byFormerOwner.statusCode).toBe(403);

    const byNewOwner = await placement(jamie.cookie, jamieAggregator);
    expect(byNewOwner.statusCode).toBe(200);
    expect(await partnerState()).toBe('placed');
  });

  it('releases a lock early and puts the partner back in the pool', async () => {
    await lock(alex.cookie);

    const released = await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/release`, cookie: alex.cookie });
    expect(released.json()).toMatchObject({ state: 'inactive', inactiveReason: 'released' });

    const view = await api(app, { method: 'GET', url: `/api/recruiter/partners/${partnerId}`, cookie: alex.cookie });
    expect(view.json().error.code).toBe('LOCK_EXPIRED');

    const releasedAgain = await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/release`, cookie: alex.cookie });
    expect(releasedAgain.json().error.code).toBe('LOCK_EXPIRED');

    const placedAfterRelease = await placement(alex.cookie, alexAggregator);
    expect(placedAfterRelease.json().error.code).toBe('LOCK_EXPIRED');

    const available = await api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: jamie.cookie });
    expect(available.json().map((partner: { id: string }) => partner.id)).toEqual([partnerId]);
  });

  it('treats an expired lock as released before the daily script runs, and lets another recruiter lock the partner straight away', async () => {
    const locked = await lock(alex.cookie);

    await execute(pool, 'UPDATE recruiter_locks SET lock_release_at = LOCALTIMESTAMP(3) - make_interval(mins => 1) WHERE id = ?', [locked.json().lock.id]);

    const available = await api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: jamie.cookie });
    expect(available.json().map((partner: { id: string }) => partner.id)).toEqual([partnerId]);

    const expiredView = await api(app, { method: 'GET', url: `/api/recruiter/partners/${partnerId}`, cookie: alex.cookie });
    expect(expiredView.json().error.code).toBe('LOCK_EXPIRED');

    const relocked = await lock(jamie.cookie);
    expect(relocked.statusCode).toBe(200);

    const rows = await query(pool, 'SELECT locked_by, state, inactive_reason FROM recruiter_locks ORDER BY locked_at');
    expect(rows).toEqual([
      { locked_by: alex.id, state: 'inactive', inactive_reason: 'expired' },
      { locked_by: jamie.id, state: 'active', inactive_reason: null },
    ]);

    await execute(pool, 'UPDATE recruiter_locks SET lock_release_at = LOCALTIMESTAMP(3) - make_interval(mins => 1) WHERE id = ?', [relocked.json().lock.id]);

    expect(await deactivateExpiredLocks()).toEqual({ deactivated: 1 });
  });

  it('lets a recruiter register a partner and holds that partner for them with no expiry once verified', async () => {
    const registered = await registerPartner(alex.cookie, { singaporePhone: '+65 8123 4567', source: 'tiktok', referrer: 'Someone else' });
    expect(registered.statusCode).toBe(201);
    expect(registered.json().partner).toMatchObject({
      name: 'Khin Myo',
      primaryPhone: '+9570000001',
      state: 'signed_up',
      source: 'recruiter',
      referrer: 'Alex Morgan',
      registeredBy: { recruiterId: alex.id, name: 'Alex Morgan', company: 'BrightPath Recruitment' },
    });

    const registeredId = registered.json().partner.id;
    const duplicate = await registerPartner(jamie.cookie);
    const anonymous = await api(app, { method: 'POST', url: '/api/recruiter/partners', payload: await partnerDetails({ primaryPhone: '+95 7000 0002' }) });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('PHONE_ALREADY_REGISTERED');
    expect(anonymous.statusCode).toBe(401);

    const mineBefore = await api(app, { method: 'GET', url: '/api/recruiter/partners/registered', cookie: alex.cookie });
    const theirs = await api(app, { method: 'GET', url: '/api/recruiter/partners/registered', cookie: jamie.cookie });
    expect(mineBefore.json().map((partner: { id: string; state: string; primaryPhone: string }) => [partner.id, partner.state, partner.primaryPhone])).toEqual([
      [registeredId, 'signed_up', '+9570000001'],
    ]);
    expect(theirs.json()).toEqual([]);

    const locksBefore = await api(app, { method: 'GET', url: '/api/recruiter/locks', cookie: alex.cookie });
    expect(locksBefore.json()).toEqual([]);

    const partnerSession = await partnerCookie(app, REGISTERED_PHONE, 'myo');
    const status = await api(app, { method: 'GET', url: '/api/partner/me', cookie: partnerSession });
    expect(status.json().partner).toMatchObject({ id: registeredId, stage: 'registered' });

    await importVerification(app, admin, [[REGISTERED_PHONE, 'true']]);

    const locks = await api(app, { method: 'GET', url: '/api/recruiter/locks', cookie: alex.cookie });
    expect(locks.json()).toHaveLength(1);
    expect(locks.json()[0].lock).toMatchObject({ partnerId: registeredId, recruiterId: alex.id, origin: 'registration', state: 'active' });
    expect(locks.json()[0].lock.lockReleaseAt).toBeUndefined();

    const availableToJamie = await api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: jamie.cookie });
    const lockByJamie = await lock(jamie.cookie, registeredId);
    const tagByAdmin = await api(app, { method: 'POST', url: `/api/admin/partners/${registeredId}/assign-recruiter`, cookie: admin, payload: { recruiterId: jamie.id } });
    expect(availableToJamie.json().map((partner: { id: string }) => partner.id)).toEqual([partnerId]);
    expect(lockByJamie.statusCode).toBe(409);
    expect(tagByAdmin.statusCode).toBe(409);

    expect(await deactivateExpiredLocks()).toEqual({ deactivated: 0 });

    const profile = await api(app, { method: 'GET', url: `/api/recruiter/partners/${registeredId}`, cookie: alex.cookie });
    expect(profile.json().partner.primaryPhone).toBe('+9570000001');

    const placed = await placement(alex.cookie, alexAggregator, TOMORROW, registeredId);
    expect(placed.statusCode).toBe(200);
    expect(placed.json()).toMatchObject({ origin: 'registration', inactiveReason: 'placed' });

    const audits = await query(pool, "SELECT actor_type, data FROM audit_logs WHERE action = 'lock.created' ORDER BY id");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor_type: 'admin' });
    expect(audits[0].data).toMatchObject({ origin: 'registration', recruiterId: alex.id, lockReleaseAt: null });
  });

  it('sends a verified partner to the pool when the recruiter who registered them is no longer active', async () => {
    const registered = await registerPartner(jamie.cookie);

    await api(app, { method: 'PUT', url: `/api/admin/recruiters/${jamie.id}/status`, cookie: admin, payload: { status: 'suspended' } });

    await importVerification(app, admin, [[REGISTERED_PHONE, 'true']]);

    const locks = await query(pool, 'SELECT id FROM recruiter_locks');
    const available = await api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: alex.cookie });
    expect(locks).toEqual([]);
    expect(available.json().map((partner: { id: string }) => partner.id).toSorted()).toEqual([partnerId, registered.json().partner.id].toSorted());
  });

  it('tells the partner when they are verified and when a recruiter assigns an aggregator and a joining date', async () => {
    const partner = await partnerCookie(app);
    const afterVerification = await api(app, { method: 'GET', url: '/api/partner/notifications', cookie: partner });
    expect(afterVerification.statusCode).toBe(200);
    expect(afterVerification.json().unreadCount).toBe(1);
    expect(afterVerification.json().notifications).toHaveLength(1);
    expect(afterVerification.json().notifications[0]).toMatchObject({ type: 'verified', read: false });

    const read = await api(app, { method: 'POST', url: '/api/partner/notifications/read', cookie: partner });
    expect(read.statusCode).toBe(204);

    await lock(alex.cookie);

    await placement(alex.cookie, alexAggregator);

    const afterPlacement = await api(app, { method: 'GET', url: '/api/partner/notifications', cookie: partner });
    expect(afterPlacement.json().unreadCount).toBe(1);
    expect(afterPlacement.json().notifications.map((item: { type: string; read: boolean }) => [item.type, item.read])).toEqual([
      ['placement', false],
      ['verified', true],
    ]);
    expect(afterPlacement.json().notifications[0].data).toEqual({ aggregatorName: DEFAULT_AGGREGATOR, startDate: TOMORROW });

    await signUp(app, { primaryPhone: '+95 5555 0000', lastName: 'Other' });

    const other = await api(app, { method: 'GET', url: '/api/partner/notifications', cookie: await partnerCookie(app, '+95 5555 0000', 'Other') });
    const anonymous = await api(app, { method: 'GET', url: '/api/partner/notifications' });
    const anonymousRead = await api(app, { method: 'POST', url: '/api/partner/notifications/read' });
    expect(other.json()).toEqual({ notifications: [], unreadCount: 0 });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymousRead.statusCode).toBe(401);

    await importVerification(app, admin, [['+95 5555 0000', 'false']]);

    const afterFailure = await api(app, { method: 'GET', url: '/api/partner/notifications', cookie: await partnerCookie(app, '+95 5555 0000', 'Other') });
    expect(afterFailure.json().notifications).toEqual([]);
  });
});
