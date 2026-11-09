import type { App } from '../src/app.js';
import { pool, query } from '../src/common/db/index.js';
import {
  api,
  closeDatabase,
  COOKIE,
  cookieOf,
  createApp,
  createVerifiedPartner,
  firstSlotId,
  loginAdmin,
  PASSWORD,
  prepareDatabase,
  resetDatabase,
  signUp,
} from './helpers.js';

describe('admin', () => {
  let app: App;
  let admin: Record<string, string>;

  beforeAll(async () => {
    await prepareDatabase();

    app = await createApp();
  });

  beforeEach(async () => {
    await resetDatabase();

    admin = await loginAdmin(app);
  });

  afterAll(async () => {
    await app.close();

    await closeDatabase();
  });

  it('accepts UC Google accounts only and restores the session from the cookie', async () => {
    const outsider = await api(app, { method: 'POST', url: '/api/admin/auth/google', payload: { credential: 'someone@gmail.com' } });
    expect(outsider.statusCode).toBe(403);

    const me = await api(app, { method: 'GET', url: '/api/admin/auth/me', cookie: admin });
    expect(me.json()).toMatchObject({ email: 'business@urbancompany.com', name: 'Admin User' });

    const anonymous = await api(app, { method: 'GET', url: '/api/admin/partners' });
    expect(anonymous.statusCode).toBe(401);
  });

  it('lists partners with both numbers, filters them and exports the CSV with an audit row', async () => {
    await signUp(app, { singaporePhone: '+65 9123 4567' });
    await signUp(app, { primaryPhone: '+95 9876 0001', interviewCity: 'bedok', slotId: firstSlotId('bedok') });

    const all = await api(app, { method: 'GET', url: '/api/admin/partners', cookie: admin });
    expect(all.json()).toHaveLength(2);
    expect(all.json().map((partner: { primaryPhone: string }) => partner.primaryPhone).toSorted()).toEqual(['+9598760000', '+9598760001']);

    const bedok = await api(app, { method: 'GET', url: '/api/admin/partners?cityKey=bedok', cookie: admin });
    expect(bedok.json()).toHaveLength(1);

    const withSingapore = await api(app, { method: 'GET', url: '/api/admin/partners?hasSingaporePhone=true', cookie: admin });
    expect(withSingapore.json().map((partner: { singaporePhone: string }) => partner.singaporePhone)).toEqual(['+6591234567']);

    const csv = await api(app, { method: 'GET', url: '/api/admin/partners/export.csv?cityKey=bedok', cookie: admin });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('"name","location","primary_mobile"');
    expect(csv.body).toContain('"Test Partner","Yangon, Myanmar","+9598760001"');
    expect(csv.body).not.toContain('+9598760000');

    const audits = await query(pool, "SELECT data FROM audit_logs WHERE action = 'partners.exported'");
    expect(audits).toHaveLength(1);
    expect(audits[0].data.count).toBe(1);
  });

  it('adds a Singapore number, creates the lead once, and rejects invalid numbers', async () => {
    const created = await signUp(app);
    const partnerId = created.json().partner.id;

    const invalid = await api(app, { method: 'PUT', url: `/api/admin/partners/${partnerId}/singapore-phone`, cookie: admin, payload: { singaporePhone: '+65 1111 2222' } });
    expect(invalid.statusCode).toBe(400);

    const first = await api(app, { method: 'PUT', url: `/api/admin/partners/${partnerId}/singapore-phone`, cookie: admin, payload: { singaporePhone: '+65 9123 4567' } });
    expect(first.statusCode).toBe(200);
    expect(first.json().singaporePhone).toBe('+6591234567');
    const leadId = first.json().onboarding.leadId;
    expect(leadId).toMatch(/^lead-/);

    const second = await api(app, { method: 'PUT', url: `/api/admin/partners/${partnerId}/singapore-phone`, cookie: admin, payload: { singaporePhone: '+65 8123 4567' } });
    expect(second.json().singaporePhone).toBe('+6581234567');
    expect(second.json().onboarding.leadId).toBe(leadId);

    const leads = await query(pool, "SELECT id FROM audit_logs WHERE action = 'partner.lead_created'");
    expect(leads).toHaveLength(1);
  });

  it('verifies uploaded partners with a Singapore number and reports every other row in the fail CSV', async () => {
    await signUp(app, { primaryPhone: '+65 9000 0012', singaporePhone: '+65 9000 0012' });
    await signUp(app, { primaryPhone: '+66 9000 0008' });

    const imported = await api(app, {
      method: 'POST',
      url: '/api/admin/verification-imports',
      cookie: admin,
      payload: { fileName: 'verified.csv', primaryPhones: ['+65 9000 0012', '+66 9000 0008', '+65 7777 7777', '+65-9000-0012', 'abc'] },
    });
    expect(imported.statusCode).toBe(201);
    expect(imported.json().counts).toEqual({ rows: 5, accepted: 1, failed: 4 });
    expect(imported.json().rows.map((row: { outcome: string }) => row.outcome)).toEqual([
      'accepted',
      'no_singapore_number',
      'not_found',
      'duplicate_in_file',
      'invalid_phone',
    ]);

    const partners = await api(app, { method: 'GET', url: '/api/admin/partners?state=verified', cookie: admin });
    expect(partners.json()).toHaveLength(1);
    expect(partners.json()[0]).toMatchObject({ primaryPhone: '+6590000012', verified: true, stage: 'verified' });
    expect(partners.json()[0].onboarding.approvedAt).toBeTruthy();

    const again = await api(app, { method: 'POST', url: '/api/admin/verification-imports', cookie: admin, payload: { fileName: 'again.csv', primaryPhones: ['+65 9000 0012'] } });
    expect(again.json().rows[0].outcome).toBe('already_verified');

    const importId = imported.json().importId;
    const report = await api(app, { method: 'GET', url: `/api/admin/verification-imports/${importId}`, cookie: admin });
    expect(report.json().rows).toHaveLength(5);

    const failCsv = await api(app, { method: 'GET', url: `/api/admin/verification-imports/${importId}/failures.csv`, cookie: admin });
    expect(failCsv.body).toContain('"row","primary_mobile","reason"');
    expect(failCsv.body).toContain('"2","+66 9000 0008","No Singapore number on file"');
    expect(failCsv.body).not.toContain('"1","+65 9000 0012"');

    const history = await query(pool, 'SELECT from_state, to_state, actor_type FROM partner_state_history');
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ from_state: 'signed_up', to_state: 'verified', actor_type: 'admin' });
  });

  it('issues a temporary partner password that replaces the old one', async () => {
    const created = await signUp(app);
    const partnerId = created.json().partner.id;

    const reset = await api(app, { method: 'POST', url: `/api/admin/partners/${partnerId}/reset-password`, cookie: admin });
    expect(reset.statusCode).toBe(200);
    const { temporaryPassword } = reset.json();
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(8);

    const old = await api(app, { method: 'POST', url: '/api/partner/auth/login', payload: { primaryPhone: '+95 9876 0000', password: PASSWORD } });
    const fresh = await api(app, { method: 'POST', url: '/api/partner/auth/login', payload: { primaryPhone: '+95 9876 0000', password: temporaryPassword } });
    expect(old.statusCode).toBe(401);
    expect(fresh.statusCode).toBe(200);
  });

  it('reports slot occupancy per day and city', async () => {
    await signUp(app);

    const occupancy = await api(app, { method: 'GET', url: '/api/admin/slot-occupancy?cityKey=tampines', cookie: admin });
    expect(occupancy.statusCode).toBe(200);
    expect(occupancy.json().length).toBeGreaterThan(0);
    expect(occupancy.json()[0]).toMatchObject({ cityKey: 'tampines', booked: 1 });
    expect(occupancy.json()[0].capacity).toBe(occupancy.json()[0].slots * 4);
  });

  it('creates recruiters with a one-time password, suspends and reactivates them', async () => {
    const created = await api(app, { method: 'POST', url: '/api/admin/recruiters', cookie: admin, payload: { email: 'Jamie.Lee@horizon.sg', name: 'Jamie Lee', company: 'Horizon' } });
    expect(created.statusCode).toBe(201);
    expect(created.json().recruiter).toMatchObject({ email: 'jamie.lee@horizon.sg', status: 'active', active: true });
    expect(created.json().temporaryPassword).toBeTruthy();

    const duplicate = await api(app, { method: 'POST', url: '/api/admin/recruiters', cookie: admin, payload: { email: 'jamie.lee@horizon.sg', name: 'Jamie', company: 'Horizon' } });
    expect(duplicate.statusCode).toBe(409);

    const recruiterId = created.json().recruiter.id;
    const suspended = await api(app, { method: 'PUT', url: `/api/admin/recruiters/${recruiterId}/status`, cookie: admin, payload: { status: 'suspended' } });
    expect(suspended.json().active).toBe(false);

    const list = await api(app, { method: 'GET', url: '/api/admin/recruiters', cookie: admin });
    expect(list.json()[0].status).toBe('suspended');
    expect(JSON.stringify(list.json())).not.toContain('password');
  });

  it('marks a placed partner as joined and refuses other transitions', async () => {
    const partnerId = await createVerifiedPartner(app, admin, '+95 9876 0000');

    const tooEarly = await api(app, { method: 'POST', url: `/api/admin/partners/${partnerId}/mark-joined`, cookie: admin });
    expect(tooEarly.statusCode).toBe(409);
    expect(tooEarly.json().error.code).toBe('INVALID_TRANSITION');
  });

  it('restores an admin session only with a valid cookie', async () => {
    const me = await api(app, { method: 'GET', url: '/api/admin/auth/me', cookie: { [COOKIE.admin]: 'not-a-token' } });
    expect(me.statusCode).toBe(401);

    const login = await api(app, { method: 'POST', url: '/api/admin/auth/google', payload: { credential: 'ops@urbanclap.com' } });
    expect(cookieOf(login, COOKIE.admin)).toBeTruthy();
  });
});
