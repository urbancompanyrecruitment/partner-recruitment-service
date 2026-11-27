import type { App } from '../src/buildApp.js';
import { pool, query } from '../src/common/db/index.js';
import { AdminRole } from '../src/service/admin/index.js';
import {
  addAggregator,
  ADMIN_EMAIL,
  api,
  closeDatabase,
  COOKIE,
  cookieOf,
  createAdminAccount,
  createApp,
  createRecruiterAccount,
  createVerifiedPartner,
  DEFAULT_PRIMARY_PHONE,
  importVerification,
  partnerCookie,
  prepareDatabase,
  resetDatabase,
  signUp,
} from './helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const LOCK_DAYS = 3;

const TOMORROW = new Date(Date.now() + DAY_MS).toISOString().slice(0, 10);

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

const loginAs = (app: App, email: string, password: string) =>
  api(app, { method: 'POST', url: '/api/admin/auth/login', payload: { email, password } });

describe('admin', () => {
  let app: App;
  let admin: Record<string, string>;
  let adminId: string;
  let adminPassword: string;

  beforeAll(async () => {
    await prepareDatabase();

    app = await createApp();
  });

  beforeEach(async () => {
    await resetDatabase();

    const account = await createAdminAccount(app);

    admin = account.cookie;
    adminId = account.id;
    adminPassword = account.temporaryPassword;
  });

  afterAll(async () => {
    await app.close();

    await closeDatabase();
  });

  it('signs an admin in with email and password and restores the session from the cookie', async () => {
    const wrong = await loginAs(app, ADMIN_EMAIL, 'not-the-password');
    const unknown = await loginAs(app, 'someone@urbancompany.com', adminPassword);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());

    const google = await api(app, { method: 'POST', url: '/api/admin/auth/google', payload: { credential: 'anything' } });
    expect(google.statusCode).toBe(404);

    const me = await api(app, { method: 'GET', url: '/api/admin/auth/me', cookie: admin });
    expect(me.json()).toMatchObject({ email: ADMIN_EMAIL, name: 'Admin User', role: 'super_admin', active: true });
    expect(JSON.stringify(me.json())).not.toContain('password');

    const forged = await api(app, { method: 'GET', url: '/api/admin/auth/me', cookie: { [COOKIE.admin]: 'not-a-token' } });
    expect(forged.statusCode).toBe(401);

    const anonymous = await api(app, { method: 'GET', url: '/api/admin/partners' });
    expect(anonymous.statusCode).toBe(401);
  });

  it('lets only a super admin create, suspend, reactivate and reset other admins', async () => {
    const created = await api(app, { method: 'POST', url: '/api/admin/admins', cookie: admin, payload: { email: 'Ops@UrbanCompany.com', name: 'Ops Admin' } });
    expect(created.statusCode).toBe(201);
    expect(created.json().admin).toMatchObject({ email: 'ops@urbancompany.com', role: 'admin', status: 'active' });

    const duplicate = await api(app, { method: 'POST', url: '/api/admin/admins', cookie: admin, payload: { email: 'ops@urbancompany.com', name: 'Ops' } });
    expect(duplicate.statusCode).toBe(409);

    const opsId = created.json().admin.id;
    const opsLogin = await loginAs(app, 'ops@urbancompany.com', created.json().temporaryPassword);
    const ops = { [COOKIE.admin]: cookieOf(opsLogin, COOKIE.admin) };

    const partners = await api(app, { method: 'GET', url: '/api/admin/partners', cookie: ops });
    expect(partners.statusCode).toBe(200);

    const listByOps = await api(app, { method: 'GET', url: '/api/admin/admins', cookie: ops });
    const createByOps = await api(app, { method: 'POST', url: '/api/admin/admins', cookie: ops, payload: { email: 'x@urbancompany.com', name: 'X' } });
    expect(listByOps.statusCode).toBe(403);
    expect(createByOps.statusCode).toBe(403);

    const list = await api(app, { method: 'GET', url: '/api/admin/admins', cookie: admin });
    expect(list.json().map((item: { email: string }) => item.email).toSorted()).toEqual([ADMIN_EMAIL, 'ops@urbancompany.com']);

    const own = await api(app, { method: 'PUT', url: `/api/admin/admins/${adminId}/status`, cookie: admin, payload: { status: 'suspended' } });
    expect(own.statusCode).toBe(403);

    const suspended = await api(app, { method: 'PUT', url: `/api/admin/admins/${opsId}/status`, cookie: admin, payload: { status: 'suspended' } });
    expect(suspended.json()).toMatchObject({ status: 'suspended', active: false });

    const afterSuspension = await api(app, { method: 'GET', url: '/api/admin/partners', cookie: ops });
    const loginWhileSuspended = await loginAs(app, 'ops@urbancompany.com', created.json().temporaryPassword);
    expect(afterSuspension.statusCode).toBe(403);
    expect(afterSuspension.json().error.code).toBe('ADMIN_SUSPENDED');
    expect(loginWhileSuspended.statusCode).toBe(403);

    await api(app, { method: 'PUT', url: `/api/admin/admins/${opsId}/status`, cookie: admin, payload: { status: 'active' } });

    const reset = await api(app, { method: 'POST', url: `/api/admin/admins/${opsId}/reset-password`, cookie: admin });
    const oldPassword = await loginAs(app, 'ops@urbancompany.com', created.json().temporaryPassword);
    const newPassword = await loginAs(app, 'ops@urbancompany.com', reset.json().temporaryPassword);
    expect(oldPassword.statusCode).toBe(401);
    expect(newPassword.statusCode).toBe(200);

    const audits = await query(pool, "SELECT action FROM audit_logs WHERE entity_type = 'admin' AND action <> 'admin.logged_in' ORDER BY id");
    expect(audits.map(row => row.action)).toEqual([
      'admin.created',
      'admin.created',
      'admin.status_changed',
      'admin.status_changed',
      'admin.password_reset',
    ]);
  });

  it('lets an admin change their own password', async () => {
    const wrongCurrent = await api(app, { method: 'POST', url: '/api/admin/change-password', cookie: admin, payload: { currentPassword: 'not-my-password', newPassword: 'AdminPass123!' } });
    expect(wrongCurrent.json().error.code).toBe('CURRENT_PASSWORD_INCORRECT');

    const changed = await api(app, { method: 'POST', url: '/api/admin/change-password', cookie: admin, payload: { currentPassword: adminPassword, newPassword: 'AdminPass123!' } });
    expect(changed.statusCode).toBe(204);

    const old = await loginAs(app, ADMIN_EMAIL, adminPassword);
    const fresh = await loginAs(app, ADMIN_EMAIL, 'AdminPass123!');
    expect(old.statusCode).toBe(401);
    expect(fresh.statusCode).toBe(200);
  });

  it('lists partners with both numbers, filters them and exports the CSV with an audit row', async () => {
    await signUp(app, { singaporePhone: '+65 9123 4567' });
    await signUp(app, { primaryPhone: '+95 9876 0001', country: 'Others', city: 'Bangkok', interviewCity: 'yangon' });

    const all = await api(app, { method: 'GET', url: '/api/admin/partners', cookie: admin });
    expect(all.json()).toHaveLength(2);
    expect(all.json().map((partner: { primaryPhone: string }) => partner.primaryPhone).toSorted()).toEqual(['+9598760000', '+9598760001']);

    const yangon = await api(app, { method: 'GET', url: '/api/admin/partners?cityKey=yangon', cookie: admin });
    expect(yangon.json()).toHaveLength(1);

    const byName = await api(app, { method: 'GET', url: '/api/admin/partners?q=TEST%20part', cookie: admin });
    expect(byName.json()).toHaveLength(2);

    const withSingapore = await api(app, { method: 'GET', url: '/api/admin/partners?hasSingaporePhone=true', cookie: admin });
    expect(withSingapore.json().map((partner: { singaporePhone: string }) => partner.singaporePhone)).toEqual(['+6591234567']);

    const csv = await api(app, { method: 'GET', url: '/api/admin/partners/export.csv?cityKey=yangon', cookie: admin });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('"name","location","primary_mobile"');
    expect(csv.body).toContain('"Test Partner","Bangkok, Others","+9598760001"');
    expect(csv.body).not.toContain('+9598760000');

    const audits = await query(pool, "SELECT data FROM audit_logs WHERE action = 'partners.exported'");
    expect(audits).toHaveLength(1);
    expect(audits[0].data.count).toBe(1);
  });

  it('exports the ops lead upload file with only the partners that have a valid Singapore number', async () => {
    await signUp(app, { singaporePhone: '+65 9123 4567' });
    await signUp(app, { primaryPhone: '+95 9876 0001' });
    await signUp(app, { primaryPhone: '+65 8123 4567', singaporePhone: '+65 8123 4567', country: 'Others', city: 'Bangkok', interviewCity: 'yangon' });
    await signUp(app, { primaryPhone: '+95 9876 0002', singaporePhone: '+65 9000 0002' });
    await importVerification(app, admin, [['+95 9876 0002', 'false']]);

    const csv = await api(app, { method: 'GET', url: '/api/admin/partners/ops-lead-upload.csv', cookie: admin });
    const [header, ...rows] = csv.body.split('\r\n');

    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('ops-lead-upload.csv');
    expect(header).toBe('name,phone,city_key,category_key,source_type,experiment_name');
    expect(rows.toSorted()).toEqual([
      'Test Partner,81234567,city_singapore_v2,test_cleaning_category,third_party,sg_recruitment_portal',
      'Test Partner,91234567,city_singapore_v2,test_cleaning_category,third_party,sg_recruitment_portal',
    ]);
    expect(csv.body).not.toContain('+65');
    expect(csv.body).not.toContain('"');

    const yangon = await api(app, { method: 'GET', url: '/api/admin/partners/ops-lead-upload.csv?cityKey=yangon', cookie: admin });
    expect(yangon.body.split('\r\n')).toEqual([
      'name,phone,city_key,category_key,source_type,experiment_name',
      'Test Partner,81234567,city_singapore_v2,test_cleaning_category,third_party,sg_recruitment_portal',
    ]);

    const audits = await query(pool, "SELECT data FROM audit_logs WHERE action = 'partners.ops_upload_exported' ORDER BY id");
    expect(audits.map(row => row.data.count)).toEqual([2, 1]);

    const anonymous = await api(app, { method: 'GET', url: '/api/admin/partners/ops-lead-upload.csv' });
    expect(anonymous.statusCode).toBe(401);
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
    expect(first.json().onboarding.approvedAt).toBeUndefined();

    const second = await api(app, { method: 'PUT', url: `/api/admin/partners/${partnerId}/singapore-phone`, cookie: admin, payload: { singaporePhone: '+65 8123 4567' } });
    expect(second.json().singaporePhone).toBe('+6581234567');
    expect(second.json().onboarding.leadId).toBe(leadId);

    const leads = await query(pool, "SELECT id FROM audit_logs WHERE action = 'partner.lead_created'");
    expect(leads).toHaveLength(1);
  });

  it('applies the verified column of the upload: true verifies, false fails, with or without a Singapore number', async () => {
    await signUp(app, { primaryPhone: '+65 9000 0012', singaporePhone: '+65 9000 0012' });
    await signUp(app, { primaryPhone: '+66 9000 0008' });
    await signUp(app, { primaryPhone: '+95 9000 0009' });

    const imported = await importVerification(app, admin, [
      ['+65 9000 0012', 'TRUE'],
      ['+66 9000 0008', 'true'],
      ['+95 9000 0009', 'false'],
      ['+65 7777 7777', 'true'],
      ['+65-9000-0012', 'true'],
      ['abc', 'true'],
      ['+95 9000 0009', 'maybe'],
    ]);
    expect(imported.statusCode).toBe(201);
    expect(imported.json().counts).toEqual({ rows: 7, accepted: 2, rejected: 1, errors: 4 });
    expect(imported.json().rows.map((row: { outcome: string }) => row.outcome)).toEqual([
      'accepted',
      'accepted',
      'rejected',
      'not_found',
      'duplicate_in_file',
      'invalid_phone',
      'invalid_verified',
    ]);

    const verified = await api(app, { method: 'GET', url: '/api/admin/partners?state=verified', cookie: admin });
    const byPhone = Object.fromEntries(verified.json().map((partner: { primaryPhone: string }) => [partner.primaryPhone, partner]));
    expect(Object.keys(byPhone).toSorted()).toEqual(['+6590000012', '+6690000008']);
    expect(byPhone['+6590000012']).toMatchObject({ verified: true, stage: 'verified' });
    expect(byPhone['+6590000012'].onboarding.approvedAt).toBeTruthy();
    expect(byPhone['+6690000008']).toMatchObject({ verified: true, stage: 'verified', hasSingaporePhone: false });
    expect(byPhone['+6690000008'].onboarding).toBeUndefined();

    const failed = await api(app, { method: 'GET', url: '/api/admin/partners?state=verification_failed', cookie: admin });
    expect(failed.json()).toHaveLength(1);
    expect(failed.json()[0]).toMatchObject({ primaryPhone: '+9590000009', state: 'verification_failed', stage: 'verification_failed', verified: false });

    const again = await importVerification(app, admin, [
      ['+65 9000 0012', 'true'],
      ['+65 9000 0012 ', 'false'],
      ['+95 9000 0009', 'true'],
    ], 'again.csv');
    expect(again.json().rows.map((row: { outcome: string }) => row.outcome)).toEqual(['already_verified', 'duplicate_in_file', 'already_failed']);
    expect(again.json().counts).toEqual({ rows: 3, accepted: 0, rejected: 0, errors: 3 });

    const importId = imported.json().importId;
    const report = await api(app, { method: 'GET', url: `/api/admin/verification-imports/${importId}`, cookie: admin });
    expect(report.json().rows).toHaveLength(7);
    expect(report.json().counts).toEqual({ rows: 7, accepted: 2, rejected: 1, errors: 4 });

    const failCsv = await api(app, { method: 'GET', url: `/api/admin/verification-imports/${importId}/failures.csv`, cookie: admin });
    expect(failCsv.body).toContain('"row","primary_mobile","verified","reason"');
    expect(failCsv.body).toContain('"4","+65 7777 7777","true","No sign-up with this primary mobile"');
    expect(failCsv.body).toContain('"7","+95 9000 0009","maybe","The verified column must be true or false"');
    expect(failCsv.body).not.toContain('"1","+65 9000 0012"');
    expect(failCsv.body).not.toContain('"3","+95 9000 0009"');

    const history = await query(pool, 'SELECT from_state, to_state, actor_type FROM partner_state_history ORDER BY to_state');
    expect(history).toEqual([
      { from_state: 'signed_up', to_state: 'verification_failed', actor_type: 'admin' },
      { from_state: 'signed_up', to_state: 'verified', actor_type: 'admin' },
      { from_state: 'signed_up', to_state: 'verified', actor_type: 'admin' },
    ]);
  });

  it('gives a partner who failed verification no way forward', async () => {
    const created = await signUp(app, { singaporePhone: '+65 9123 4567' });
    const partnerId = created.json().partner.id;

    await importVerification(app, admin, [[DEFAULT_PRIMARY_PHONE, 'false']]);

    const status = await api(app, { method: 'GET', url: '/api/partner/me', cookie: await partnerCookie(app) });
    expect(status.json().partner).toMatchObject({ state: 'verification_failed', stage: 'verification_failed', verified: false });
    expect(status.json().partner.onboarding.approvedAt).toBeUndefined();

    const joined = await api(app, { method: 'POST', url: `/api/admin/partners/${partnerId}/mark-joined`, cookie: admin });
    expect(joined.json().error.code).toBe('INVALID_TRANSITION');

    const newNumber = await api(app, { method: 'PUT', url: `/api/admin/partners/${partnerId}/singapore-phone`, cookie: admin, payload: { singaporePhone: '+65 8123 4567' } });
    expect(newNumber.statusCode).toBe(409);
    expect(newNumber.json().error.code).toBe('INVALID_TRANSITION');

    const recruiter = await createRecruiterAccount(app, admin);
    const available = await api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: recruiter.cookie });
    const lock = await api(app, { method: 'POST', url: `/api/recruiter/partners/${partnerId}/lock`, cookie: recruiter.cookie });
    expect(available.json()).toHaveLength(0);
    expect(lock.statusCode).toBeGreaterThanOrEqual(400);

    const hub = await api(app, { method: 'POST', url: '/api/admin/hub-imports', cookie: admin, payload: { fileName: 'hubs.csv', rows: [{ primaryPhone: DEFAULT_PRIMARY_PHONE, hubName: 'Tampines' }] } });
    expect(hub.json().rows[0].outcome).toBe('not_eligible');
  });

  it('approves the lead when the Singapore number arrives after verification', async () => {
    const created = await signUp(app);
    const partnerId = created.json().partner.id;

    await importVerification(app, admin, [[DEFAULT_PRIMARY_PHONE, 'yes']]);

    const updated = await api(app, { method: 'PUT', url: `/api/admin/partners/${partnerId}/singapore-phone`, cookie: admin, payload: { singaporePhone: '+65 9123 4567' } });
    expect(updated.json()).toMatchObject({ state: 'verified', singaporePhone: '+6591234567' });
    expect(updated.json().onboarding.leadId).toMatch(/^lead-/);
    expect(updated.json().onboarding.approvedAt).toBeTruthy();

    const approvals = await query(pool, "SELECT id FROM audit_logs WHERE action = 'partner.lead_approved'");
    expect(approvals).toHaveLength(1);
  });

  it('updates the hub of each partner from the hub upload and reports the rows it could not apply', async () => {
    await signUp(app);
    await signUp(app, { primaryPhone: '+95 9876 0001' });

    const imported = await api(app, {
      method: 'POST',
      url: '/api/admin/hub-imports',
      cookie: admin,
      payload: {
        fileName: 'hubs.csv',
        rows: [
          { primaryPhone: '+95 9876 0000', hubName: ' Tampines East ' },
          { primaryPhone: '+95-9876-0001', hubName: 'Jurong West' },
          { primaryPhone: '+95 9876 0000', hubName: 'Bedok' },
          { primaryPhone: '+95 1111 1111', hubName: 'Bedok' },
          { primaryPhone: '+95 9876 0001', hubName: '' },
          { primaryPhone: 'abc', hubName: 'Bedok' },
        ],
      },
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().counts).toEqual({ rows: 6, updated: 2, errors: 4 });
    expect(imported.json().rows.map((row: { outcome: string }) => row.outcome)).toEqual([
      'updated',
      'updated',
      'duplicate_in_file',
      'not_found',
      'missing_hub',
      'invalid_phone',
    ]);

    const partners = await api(app, { method: 'GET', url: '/api/admin/partners', cookie: admin });
    const hubs = Object.fromEntries(partners.json().map((partner: { primaryPhone: string; hubName: string }) => [partner.primaryPhone, partner.hubName]));
    expect(hubs).toEqual({ '+9598760000': 'Tampines East', '+9598760001': 'Jurong West' });

    await api(app, { method: 'POST', url: '/api/admin/hub-imports', cookie: admin, payload: { fileName: 'hubs-2.csv', rows: [{ primaryPhone: '+95 9876 0000', hubName: 'Woodlands' }] } });

    const status = await api(app, { method: 'GET', url: '/api/partner/me', cookie: await partnerCookie(app) });
    expect(status.json().partner.hubName).toBe('Woodlands');

    const audits = await query(pool, "SELECT data FROM audit_logs WHERE action = 'partner.hub_updated' ORDER BY id");
    expect(audits.map(row => row.data)).toEqual([
      { from: null, to: 'Tampines East' },
      { from: null, to: 'Jurong West' },
      { from: 'Tampines East', to: 'Woodlands' },
    ]);

    const anonymous = await api(app, { method: 'POST', url: '/api/admin/hub-imports', payload: { fileName: 'hubs.csv', rows: [{ primaryPhone: '+95 9876 0000', hubName: 'X' }] } });
    expect(anonymous.statusCode).toBe(401);
  });

  it('has no partner password to reset any more', async () => {
    const created = await signUp(app);
    const partnerId = created.json().partner.id;

    const reset = await api(app, { method: 'POST', url: `/api/admin/partners/${partnerId}/reset-password`, cookie: admin });
    expect(reset.statusCode).toBe(404);
  });

  it('reports slot occupancy per day and city', async () => {
    await signUp(app);

    const occupancy = await api(app, { method: 'GET', url: '/api/admin/slot-occupancy?cityKey=singapore', cookie: admin });
    expect(occupancy.statusCode).toBe(200);
    expect(occupancy.json().length).toBeGreaterThan(0);
    expect(occupancy.json()[0]).toMatchObject({ cityKey: 'singapore', booked: 1 });
    expect(occupancy.json()[0].capacity).toBe(occupancy.json()[0].slots * 4);
  });

  it('creates recruiters with a one-time password, suspends them and brings them back', async () => {
    const created = await api(app, { method: 'POST', url: '/api/admin/recruiters', cookie: admin, payload: { email: 'Jamie.Lee@horizon.sg', name: 'Jamie Lee', company: 'Horizon' } });
    expect(created.statusCode).toBe(201);
    expect(created.json().recruiter).toMatchObject({ email: 'jamie.lee@horizon.sg', status: 'active', active: true, selfRegistered: false });
    expect(created.json().temporaryPassword).toBeTruthy();

    const duplicate = await api(app, { method: 'POST', url: '/api/admin/recruiters', cookie: admin, payload: { email: 'jamie.lee@horizon.sg', name: 'Jamie', company: 'Horizon' } });
    expect(duplicate.statusCode).toBe(409);

    const recruiterId = created.json().recruiter.id;
    const credentials = { email: 'jamie.lee@horizon.sg', password: created.json().temporaryPassword };
    const suspended = await api(app, { method: 'PUT', url: `/api/admin/recruiters/${recruiterId}/status`, cookie: admin, payload: { status: 'suspended' } });
    expect(suspended.json()).toMatchObject({ status: 'suspended', active: false });

    const signedInWhileSuspended = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: credentials });
    expect(signedInWhileSuspended.statusCode).toBe(200);
    expect(signedInWhileSuspended.json()).toMatchObject({ status: 'suspended', active: false });

    const list = await api(app, { method: 'GET', url: '/api/admin/recruiters', cookie: admin });
    expect(list.json()[0].status).toBe('suspended');
    expect(JSON.stringify(list.json())).not.toContain('password');

    const restored = await api(app, { method: 'PUT', url: `/api/admin/recruiters/${recruiterId}/status`, cookie: admin, payload: { status: 'active' } });
    expect(restored.json()).toMatchObject({ status: 'active', active: true });

    const back = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: credentials });
    expect(back.statusCode).toBe(200);

    const pending = await api(app, { method: 'PUT', url: `/api/admin/recruiters/${recruiterId}/status`, cookie: admin, payload: { status: 'pending' } });
    const rejectActive = await api(app, { method: 'PUT', url: `/api/admin/recruiters/${recruiterId}/status`, cookie: admin, payload: { status: 'rejected' } });
    expect(pending.statusCode).toBe(400);
    expect(rejectActive.statusCode).toBe(409);
  });

  it('shows how each recruiter is doing: locks acquired and placements submitted', async () => {
    const alex = await createRecruiterAccount(app, admin, 'alex@brightpath.sg');
    const jamie = await createRecruiterAccount(app, admin, 'jamie@horizon.sg');
    const first = await createVerifiedPartner(app, admin, '+95 9876 0000');
    const second = await createVerifiedPartner(app, admin, '+95 9876 0001', '+65 8123 4567', 1);
    const aggregatorId = await addAggregator(app, admin, alex.id);

    await api(app, { method: 'POST', url: `/api/recruiter/partners/${first}/lock`, cookie: alex.cookie });
    await api(app, { method: 'POST', url: `/api/recruiter/partners/${first}/placement`, cookie: alex.cookie, payload: { aggregatorId, startDate: TOMORROW } });
    await api(app, { method: 'POST', url: `/api/recruiter/partners/${second}/lock`, cookie: alex.cookie });
    await api(app, { method: 'POST', url: `/api/recruiter/partners/${second}/release`, cookie: alex.cookie });
    await api(app, { method: 'POST', url: `/api/recruiter/partners/${second}/lock`, cookie: alex.cookie });

    const list = await api(app, { method: 'GET', url: '/api/admin/recruiters', cookie: admin });
    const stats = Object.fromEntries(
      list.json().map((recruiter: { id: string; locksAcquired: number; placementsSubmitted: number }) => [
        recruiter.id,
        [recruiter.locksAcquired, recruiter.placementsSubmitted],
      ]),
    );
    expect(stats).toEqual({ [alex.id]: [3, 1], [jamie.id]: [0, 0] });
  });

  it('adds aggregators to a recruiter and removes them, keeping each recruiter list separate', async () => {
    const alex = await createRecruiterAccount(app, admin, 'alex@brightpath.sg');
    const jamie = await createRecruiterAccount(app, admin, 'jamie@horizon.sg');
    const aggregatorsOf = async (cookie: Record<string, string>) =>
      (await api(app, { method: 'GET', url: '/api/recruiter/aggregators', cookie })).json().map((aggregator: { name: string }) => aggregator.name);

    const added = await api(app, { method: 'POST', url: `/api/admin/recruiters/${alex.id}/aggregators`, cookie: admin, payload: { name: '  CleanSpace   Services ' } });
    expect(added.statusCode).toBe(201);
    expect(added.json()).toMatchObject({ recruiterId: alex.id, name: 'CleanSpace Services' });

    const duplicate = await api(app, { method: 'POST', url: `/api/admin/recruiters/${alex.id}/aggregators`, cookie: admin, payload: { name: 'cleanspace services' } });
    const blank = await api(app, { method: 'POST', url: `/api/admin/recruiters/${alex.id}/aggregators`, cookie: admin, payload: { name: '   ' } });
    const unknownRecruiter = await api(app, { method: 'POST', url: `/api/admin/recruiters/${UNKNOWN_ID}/aggregators`, cookie: admin, payload: { name: 'CleanSpace Services' } });
    const byRecruiter = await api(app, { method: 'POST', url: `/api/admin/recruiters/${alex.id}/aggregators`, cookie: alex.cookie, payload: { name: 'Self Added' } });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('AGGREGATOR_ALREADY_EXISTS');
    expect(blank.json().error.code).toBe('VALIDATION_FAILED');
    expect(unknownRecruiter.statusCode).toBe(404);
    expect(byRecruiter.statusCode).toBe(401);

    await addAggregator(app, admin, alex.id, 'HomeCare Collective');
    await addAggregator(app, admin, jamie.id, 'CleanSpace Services');

    expect(await aggregatorsOf(alex.cookie)).toEqual(['CleanSpace Services', 'HomeCare Collective']);
    expect(await aggregatorsOf(jamie.cookie)).toEqual(['CleanSpace Services']);

    const list = await api(app, { method: 'GET', url: '/api/admin/recruiters', cookie: admin });
    const byRecruiterId = Object.fromEntries(
      list.json().map((recruiter: { id: string; aggregators: Array<{ name: string }> }) => [recruiter.id, recruiter.aggregators.map(aggregator => aggregator.name)]),
    );
    expect(byRecruiterId).toEqual({ [alex.id]: ['CleanSpace Services', 'HomeCare Collective'], [jamie.id]: ['CleanSpace Services'] });

    const removedByWrongRecruiter = await api(app, { method: 'DELETE', url: `/api/admin/recruiters/${jamie.id}/aggregators/${added.json().id}`, cookie: admin });
    const removed = await api(app, { method: 'DELETE', url: `/api/admin/recruiters/${alex.id}/aggregators/${added.json().id}`, cookie: admin });
    const removedAgain = await api(app, { method: 'DELETE', url: `/api/admin/recruiters/${alex.id}/aggregators/${added.json().id}`, cookie: admin });
    expect(removedByWrongRecruiter.statusCode).toBe(404);
    expect(removed.statusCode).toBe(204);
    expect(removedAgain.statusCode).toBe(404);
    expect(await aggregatorsOf(alex.cookie)).toEqual(['HomeCare Collective']);
    expect(await aggregatorsOf(jamie.cookie)).toEqual(['CleanSpace Services']);

    const readded = await api(app, { method: 'POST', url: `/api/admin/recruiters/${alex.id}/aggregators`, cookie: admin, payload: { name: 'CleanSpace Services' } });
    expect(readded.statusCode).toBe(201);

    const audits = await query(pool, "SELECT action, actor_type FROM audit_logs WHERE entity_type = 'aggregator' ORDER BY id");
    expect(audits.map(row => row.action)).toEqual(['aggregator.added', 'aggregator.added', 'aggregator.added', 'aggregator.removed', 'aggregator.added']);
    expect(audits.every(row => row.actor_type === 'admin')).toBe(true);
  });

  it('tags a verified partner to a recruiter for three days, and only when the partner is free and the recruiter active', async () => {
    const alex = await createRecruiterAccount(app, admin, 'alex@brightpath.sg');
    const jamie = await createRecruiterAccount(app, admin, 'jamie@horizon.sg');
    const partnerId = await createVerifiedPartner(app, admin, '+95 9876 0000');
    const signedUp = await signUp(app, { primaryPhone: '+95 9876 0001' });
    const assign = (id: string, recruiterId: string, cookie: Record<string, string> | undefined = admin) =>
      api(app, { method: 'POST', url: `/api/admin/partners/${id}/assign-recruiter`, cookie, payload: { recruiterId } });

    const notVerified = await assign(signedUp.json().partner.id, alex.id);
    const unknownRecruiter = await assign(partnerId, UNKNOWN_ID);
    const unknownPartner = await assign(UNKNOWN_ID, alex.id);
    const byRecruiter = await assign(partnerId, alex.id, alex.cookie);
    expect(notVerified.statusCode).toBe(409);
    expect(notVerified.json().error.code).toBe('NOT_AVAILABLE');
    expect(unknownRecruiter.statusCode).toBe(404);
    expect(unknownPartner.statusCode).toBe(404);
    expect(byRecruiter.statusCode).toBe(401);

    await api(app, { method: 'PUT', url: `/api/admin/recruiters/${jamie.id}/status`, cookie: admin, payload: { status: 'suspended' } });

    const toSuspended = await assign(partnerId, jamie.id);
    expect(toSuspended.statusCode).toBe(409);
    expect(toSuspended.json().error.code).toBe('RECRUITER_NOT_ACTIVE');

    const tagged = await assign(partnerId, alex.id);
    expect(tagged.statusCode).toBe(201);
    expect(tagged.json()).toMatchObject({ partnerId, recruiterId: alex.id, origin: 'admin', state: 'active' });
    expect(Date.parse(tagged.json().lockReleaseAt) - Date.parse(tagged.json().lockedAt)).toBe(LOCK_DAYS * DAY_MS);

    const again = await assign(partnerId, alex.id);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('NOT_AVAILABLE');

    const mine = await api(app, { method: 'GET', url: '/api/recruiter/locks', cookie: alex.cookie });
    const profile = await api(app, { method: 'GET', url: `/api/recruiter/partners/${partnerId}`, cookie: alex.cookie });
    const available = await api(app, { method: 'GET', url: '/api/recruiter/partners/available', cookie: alex.cookie });
    expect(mine.json().map((item: { lock: { id: string } }) => item.lock.id)).toEqual([tagged.json().id]);
    expect(profile.json().partner.primaryPhone).toBe('+9598760000');
    expect(available.json()).toEqual([]);

    const locks = await api(app, { method: 'GET', url: '/api/admin/locks', cookie: admin });
    expect(locks.json()[0]).toMatchObject({ id: tagged.json().id, origin: 'admin', recruiterName: 'Alex Morgan' });

    const rows = await query(pool, 'SELECT origin, assigned_by_admin_id FROM recruiter_locks');
    const audits = await query(pool, "SELECT actor_type, actor_id, data FROM audit_logs WHERE action = 'lock.created'");
    const reveals = await query(pool, "SELECT actor_type FROM audit_logs WHERE action = 'phone.revealed'");
    expect(rows).toEqual([{ origin: 'admin', assigned_by_admin_id: adminId }]);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor_type: 'admin', actor_id: adminId });
    expect(audits[0].data).toMatchObject({ origin: 'admin', recruiterId: alex.id });
    expect(reveals).toEqual([{ actor_type: 'recruiter' }]);
  });

  it('resets a recruiter password to a temporary one that replaces the old one', async () => {
    const created = await api(app, { method: 'POST', url: '/api/admin/recruiters', cookie: admin, payload: { email: 'sam@agency.sg', name: 'Sam Tan', company: 'Agency' } });
    const { recruiter, temporaryPassword: first } = created.json();

    const reset = await api(app, { method: 'POST', url: `/api/admin/recruiters/${recruiter.id}/reset-password`, cookie: admin });
    expect(reset.statusCode).toBe(200);
    const { temporaryPassword } = reset.json();
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(8);
    expect(temporaryPassword).not.toBe(first);

    const old = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'sam@agency.sg', password: first } });
    const fresh = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'sam@agency.sg', password: temporaryPassword } });
    expect(old.statusCode).toBe(401);
    expect(fresh.statusCode).toBe(200);

    const audits = await query(pool, "SELECT actor_type, entity_id FROM audit_logs WHERE action = 'recruiter.password_reset'");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor_type: 'admin', entity_id: recruiter.id });

    const unknown = await api(app, { method: 'POST', url: '/api/admin/recruiters/00000000-0000-4000-8000-000000000000/reset-password', cookie: admin });
    expect(unknown.statusCode).toBe(404);

    const anonymous = await api(app, { method: 'POST', url: `/api/admin/recruiters/${recruiter.id}/reset-password` });
    expect(anonymous.statusCode).toBe(401);
  });

  it('marks a placed partner as joined and refuses other transitions', async () => {
    const partnerId = await createVerifiedPartner(app, admin, '+95 9876 0000');

    const tooEarly = await api(app, { method: 'POST', url: `/api/admin/partners/${partnerId}/mark-joined`, cookie: admin });
    expect(tooEarly.statusCode).toBe(409);
    expect(tooEarly.json().error.code).toBe('INVALID_TRANSITION');
  });

  it('keeps ordinary admins out of admin account management but lets them run the dashboard', async () => {
    const ops = await createAdminAccount(app, 'ops@example.com', AdminRole.Admin);

    const recruiters = await api(app, { method: 'GET', url: '/api/admin/recruiters', cookie: ops.cookie });
    const admins = await api(app, { method: 'GET', url: '/api/admin/admins', cookie: ops.cookie });
    const me = await api(app, { method: 'GET', url: '/api/admin/auth/me', cookie: ops.cookie });

    expect(recruiters.statusCode).toBe(200);
    expect(admins.statusCode).toBe(403);
    expect(me.json().role).toBe('admin');
  });
});
