import type { App } from '../src/app.js';
import { execute, pool, query } from '../src/common/db/index.js';
import { deactivateExpiredLocks } from '../src/service/lock/index.js';
import {
  api,
  closeDatabase,
  createApp,
  createRecruiterAccount,
  createVerifiedPartner,
  loginAdmin,
  prepareDatabase,
  resetDatabase,
  signUp,
} from './helpers.js';

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('recruiter locks and placements', () => {
  let app: App;
  let admin: Record<string, string>;
  let alex: Awaited<ReturnType<typeof createRecruiterAccount>>;
  let jamie: Awaited<ReturnType<typeof createRecruiterAccount>>;
  let partnerId: string;

  beforeAll(async () => {
    await prepareDatabase();

    app = await createApp();
  });

  beforeEach(async () => {
    await resetDatabase();

    admin = await loginAdmin(app);
    alex = await createRecruiterAccount(app, admin, 'alex@brightpath.sg');
    jamie = await createRecruiterAccount(app, admin, 'jamie@horizon.sg');
    partnerId = await createVerifiedPartner(app, admin, '+95 9876 0000');
  });

  afterAll(async () => {
    await app.close();

    await closeDatabase();
  });

  it('rejects suspended recruiters at login and on existing sessions', async () => {
    const me = await api(app, { method: 'GET', url: '/api/recruiter/auth/me', cookie: alex.cookie });
    expect(me.json()).toMatchObject({ email: 'alex@brightpath.sg', company: 'BrightPath Recruitment' });

    await api(app, { method: 'PUT', url: `/api/admin/recruiters/${alex.id}/status`, cookie: admin, payload: { status: 'suspended' } });

    const afterSuspension = await api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: alex.cookie });
    expect(afterSuspension.statusCode).toBe(403);

    const login = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'alex@brightpath.sg', password: alex.temporaryPassword } });
    expect(login.statusCode).toBe(403);

    const wrong = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'jamie@horizon.sg', password: 'wrong' } });
    expect(wrong.statusCode).toBe(401);
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

  it('locks a partner for exactly one of two concurrent recruiters and reveals the numbers to the owner', async () => {
    const [a, b] = await Promise.all([
      api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/lock`, cookie: alex.cookie }),
      api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/lock`, cookie: jamie.cookie }),
    ]);
    const statuses = [a.statusCode, b.statusCode].toSorted();
    expect(statuses).toEqual([200, 409]);

    const winner = a.statusCode === 200 ? alex : jamie;
    const loser = a.statusCode === 200 ? jamie : alex;
    const won = a.statusCode === 200 ? a : b;
    expect(won.json().partner.primaryPhone).toBe('+9598760000');
    expect(won.json().partner.singaporePhone).toBe('+6591234567');
    expect(won.json().lock.state).toBe('active');

    const again = await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/lock`, cookie: winner.cookie });
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

  it('records a placement for the lock owner only, moving the partner to placed', async () => {
    await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/lock`, cookie: alex.cookie });

    const byOther = await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/placement`, cookie: jamie.cookie, payload: { employerName: 'CleanSpace', startDate: TOMORROW } });
    expect(byOther.statusCode).toBe(403);

    const past = await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/placement`, cookie: alex.cookie, payload: { employerName: 'CleanSpace', startDate: '2020-01-01' } });
    expect(past.json().error.code).toBe('INVALID_START_DATE');

    const placed = await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/placement`, cookie: alex.cookie, payload: { employerName: 'CleanSpace Services', startDate: TOMORROW } });
    expect(placed.statusCode).toBe(200);
    expect(placed.json()).toMatchObject({ state: 'inactive', inactiveReason: 'placed', employerName: 'CleanSpace Services', startDate: TOMORROW });

    const mine = await api(app, { method: 'GET', url: '/api/recruiter/locks', cookie: alex.cookie });
    expect(mine.json()).toHaveLength(1);
    expect(mine.json()[0].partner).toMatchObject({ id: partnerId, state: 'placed', stage: 'placed' });

    const updated = await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/placement`, cookie: alex.cookie, payload: { employerName: 'CleanSpace Services Pte', startDate: TOMORROW } });
    expect(updated.json().employerName).toBe('CleanSpace Services Pte');

    const joined = await api(app, { method: 'POST', url: `/api/admin/partners/${partnerId}/mark-joined`, cookie: admin });
    expect(joined.json().state).toBe('joined');

    const locks = await api(app, { method: 'GET', url: '/api/admin/locks', cookie: admin });
    expect(locks.json()[0]).toMatchObject({ partnerName: 'Test Partner', recruiterName: 'Alex Morgan', employerName: 'CleanSpace Services Pte' });
  });

  it('releases a lock early and puts the partner back in the pool', async () => {
    await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/lock`, cookie: alex.cookie });

    const released = await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/release`, cookie: alex.cookie });
    expect(released.json()).toMatchObject({ state: 'inactive', inactiveReason: 'released' });

    const view = await api(app, { method: 'GET', url: `/api/recruiter/partners/${partnerId}`, cookie: alex.cookie });
    expect(view.json().error.code).toBe('LOCK_EXPIRED');

    const available = await api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: jamie.cookie });
    expect(available.json().map((partner: { id: string }) => partner.id)).toEqual([partnerId]);
  });

  it('treats an expired lock as released before the daily script runs, which then marks it inactive', async () => {
    const locked = await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/lock`, cookie: alex.cookie });

    await execute(pool, 'UPDATE recruiter_locks SET lock_release_at = DATE_SUB(NOW(3), INTERVAL 1 MINUTE) WHERE id = ?', [locked.json().lock.id]);

    const available = await api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: jamie.cookie });
    expect(available.json().map((partner: { id: string }) => partner.id)).toEqual([partnerId]);

    const expiredView = await api(app, { method: 'GET', url: `/api/recruiter/partners/${partnerId}`, cookie: alex.cookie });
    expect(expiredView.json().error.code).toBe('LOCK_EXPIRED');

    expect(await deactivateExpiredLocks()).toEqual({ deactivated: 1 });

    const rows = await query(pool, 'SELECT state, inactive_reason FROM recruiter_locks');
    expect(rows[0]).toMatchObject({ state: 'inactive', inactive_reason: 'expired' });

    const relocked = await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/lock`, cookie: jamie.cookie });
    expect(relocked.statusCode).toBe(200);
  });
});
