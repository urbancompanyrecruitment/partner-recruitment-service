const MAIL = vi.hoisted(() => {
  process.env.PORTAL_BASE_URL = 'https://portal.test/';
  process.env.SMTP_HOST = 'smtp.test';
  process.env.MAIL_FROM = 'TalentLink <no-reply@portal.test>';

  return { sent: [] as Array<{ to: string; subject: string; text: string; html: string }>, accept: true, delayMs: 0, throws: false, touches: 0 };
});

vi.mock('../src/common/clients/mail.js', () => ({
  isMailConfigured: () => true,
  touchMailServer: async () => {
    await new Promise(resolve => setTimeout(resolve, MAIL.delayMs));

    MAIL.touches += 1;
  },
  sendMail: async (message: { to: string; subject: string; text: string; html: string }) => {
    await new Promise(resolve => setTimeout(resolve, MAIL.delayMs));

    if (MAIL.throws) throw new Error('SMTP down');

    MAIL.sent.push(message);

    return MAIL.accept;
  },
}));

import type { App } from '../src/buildApp.js';
import { config } from '../src/common/config/index.js';
import { execute, pool, query } from '../src/common/db/index.js';
import { api, closeDatabase, COOKIE, cookieOf, createAdminAccount, createApp, createRecruiterAccount, prepareDatabase, resetDatabase } from './helpers.js';

const RESET_LINK = /https:\/\/portal\.test\/(recruiter|admin)\/reset-password#token=([A-Za-z0-9_-]+)/;

const lastResetToken = (): string => {
  const match = RESET_LINK.exec(MAIL.sent.at(-1)?.text ?? '');

  if (!match) throw new Error('No reset link was sent');

  return match[2];
};

describe('forgot password', () => {
  let app: App;
  let admin: Record<string, string>;

  beforeAll(async () => {
    await prepareDatabase();

    app = await createApp();
  });

  beforeEach(async () => {
    await resetDatabase();

    MAIL.sent.length = 0;
    MAIL.accept = true;
    MAIL.delayMs = 0;
    MAIL.throws = false;
    MAIL.touches = 0;
    admin = (await createAdminAccount(app)).cookie;
  });

  afterAll(async () => {
    await app.close();

    await closeDatabase();
  });

  it('emails a recruiter a one-time link that sets a new password and unlocks the account', async () => {
    const recruiter = await createRecruiterAccount(app, admin);
    await execute(pool, "UPDATE recruiters SET failed_login_count = 10, login_locked_until = LOCALTIMESTAMP(3) + INTERVAL '10 minutes' WHERE id = ?", [recruiter.id]);

    const requested = await api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email: ' Alex@BrightPath.sg ' } });
    expect(requested.statusCode).toBe(204);
    expect(MAIL.sent).toHaveLength(1);
    expect(MAIL.sent[0]).toMatchObject({ to: 'alex@brightpath.sg', subject: 'Reset your TalentLink password' });
    expect(MAIL.sent[0].text).toContain('https://portal.test/recruiter/reset-password#token=');

    const token = lastResetToken();
    const stored = await query(pool, 'SELECT token_hash FROM password_reset_tokens');
    expect(stored).toHaveLength(1);
    expect(stored[0].token_hash).not.toBe(token);

    const weak = await api(app, { method: 'POST', url: '/api/recruiter/auth/reset-password', payload: { token, password: 'short' } });
    expect(weak.json().error.code).toBe('VALIDATION_FAILED');

    const reset = await api(app, { method: 'POST', url: '/api/recruiter/auth/reset-password', payload: { token, password: 'NewPassword123' } });
    expect(reset.statusCode).toBe(204);

    const oldPassword = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'alex@brightpath.sg', password: recruiter.temporaryPassword } });
    expect(oldPassword.statusCode).toBe(401);

    const newPassword = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'alex@brightpath.sg', password: 'NewPassword123' } });
    expect(newPassword.statusCode).toBe(200);

    const reused = await api(app, { method: 'POST', url: '/api/recruiter/auth/reset-password', payload: { token, password: 'Another123456' } });
    expect(reused.statusCode).toBe(400);
    expect(reused.json().error.code).toBe('RESET_LINK_INVALID');

    const audits = await query(pool, "SELECT action FROM audit_logs WHERE action LIKE 'password_reset.%' ORDER BY id");
    expect(audits.map(row => row.action)).toEqual(['password_reset.requested', 'password_reset.completed']);
  });

  it('answers the same for unknown emails and sends nothing', async () => {
    const unknown = await api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email: 'nobody@example.com' } });
    expect(unknown.statusCode).toBe(204);
    expect(MAIL.sent).toHaveLength(0);

    const invalid = await api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email: 'not-an-email' } });
    expect(invalid.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('keeps recruiter and admin links apart and rejects expired or unknown tokens', async () => {
    await createRecruiterAccount(app, admin);

    await api(app, { method: 'POST', url: '/api/admin/auth/forgot-password', payload: { email: 'admin@example.com' } });
    const adminToken = lastResetToken();
    expect(MAIL.sent[0].text).toContain('https://portal.test/admin/reset-password#token=');

    const wrongPortal = await api(app, { method: 'POST', url: '/api/recruiter/auth/reset-password', payload: { token: adminToken, password: 'NewPassword123' } });
    expect(wrongPortal.json().error.code).toBe('RESET_LINK_INVALID');

    const unknown = await api(app, { method: 'POST', url: '/api/admin/auth/reset-password', payload: { token: 'made-up-token', password: 'NewPassword123' } });
    expect(unknown.json().error.code).toBe('RESET_LINK_INVALID');

    await execute(pool, "UPDATE password_reset_tokens SET expires_at = LOCALTIMESTAMP(3) - INTERVAL '1 minute'");
    const expired = await api(app, { method: 'POST', url: '/api/admin/auth/reset-password', payload: { token: adminToken, password: 'NewPassword123' } });
    expect(expired.json().error.code).toBe('RESET_LINK_INVALID');

    await api(app, { method: 'POST', url: '/api/admin/auth/forgot-password', payload: { email: 'admin@example.com' } });
    const fresh = await api(app, { method: 'POST', url: '/api/admin/auth/reset-password', payload: { token: lastResetToken(), password: 'NewPassword123' } });
    expect(fresh.statusCode).toBe(204);

    const login = await api(app, { method: 'POST', url: '/api/admin/auth/login', payload: { email: 'admin@example.com', password: 'NewPassword123' } });
    expect(login.statusCode).toBe(200);
  });

  it('sends at most three links per account in fifteen minutes and voids older links once one is used', async () => {
    await createRecruiterAccount(app, admin);
    const request = () => api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email: 'alex@brightpath.sg' } });

    await request();
    const firstToken = lastResetToken();
    await request();
    await request();
    await request();
    expect(MAIL.sent).toHaveLength(3);

    const used = await api(app, { method: 'POST', url: '/api/recruiter/auth/reset-password', payload: { token: lastResetToken(), password: 'NewPassword123' } });
    expect(used.statusCode).toBe(204);

    const older = await api(app, { method: 'POST', url: '/api/recruiter/auth/reset-password', payload: { token: firstToken, password: 'Another123456' } });
    expect(older.json().error.code).toBe('RESET_LINK_INVALID');
  });

  it('answers unknown, known, rate-capped and failing requests alike, even when the mail server is slower than the fixed time', async () => {
    await createRecruiterAccount(app, admin);
    const timed = async (email: string) => {
      const started = performance.now();
      const response = await api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email } });

      return { status: response.statusCode, body: response.body, ms: performance.now() - started };
    };

    MAIL.delayMs = config.forgotPasswordResponseMs * 2;
    const known = await timed('alex@brightpath.sg');
    const unknown = await timed('nobody@brightpath.sg');
    await timed('alex@brightpath.sg');
    await timed('alex@brightpath.sg');
    const capped = await timed('alex@brightpath.sg');
    MAIL.throws = true;
    await execute(pool, 'DELETE FROM password_reset_tokens');
    const failing = await timed('alex@brightpath.sg');
    const results = [known, unknown, capped, failing];

    expect(results.map(result => result.status)).toEqual([204, 204, 204, 204]);
    expect(results.map(result => result.body)).toEqual(['', '', '', '']);
    results.forEach(result => expect(result.ms).toBeGreaterThanOrEqual(config.forgotPasswordResponseMs - 5));
    expect(Math.max(...results.map(result => result.ms)) - Math.min(...results.map(result => result.ms))).toBeLessThan(100);
    expect(MAIL.touches).toBe(2);
  }, 20000);

  it('builds the link from the configured portal address, never from the request headers', async () => {
    await createRecruiterAccount(app, admin);

    await api(app, {
      method: 'POST',
      url: '/api/recruiter/auth/forgot-password',
      headers: { host: 'evil.test', 'x-forwarded-host': 'evil.test', 'x-forwarded-proto': 'http', origin: 'https://evil.test' },
      payload: { email: 'alex@brightpath.sg' },
    });

    expect(MAIL.sent).toHaveLength(1);
    expect(MAIL.sent[0].text).not.toContain('evil.test');
    expect(MAIL.sent[0].html).not.toContain('evil.test');
    expect(MAIL.sent[0].text).toContain('https://portal.test/recruiter/reset-password#token=');
  });

  it('sends only to the stored address and refuses arrays, objects and extra recipients', async () => {
    await createRecruiterAccount(app, admin);
    const send = (payload: unknown) => api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: payload as Record<string, unknown> });

    const arrays = await send({ email: ['alex@brightpath.sg', 'attacker@evil.test'] });
    const objects = await send({ email: { $ne: '' } });
    const commaList = await send({ email: 'alex@brightpath.sg,attacker@evil.test' });
    const injected = await send({ email: 'alex@brightpath.sg\r\nBcc: attacker@evil.test' });
    expect([arrays, objects, commaList, injected].map(response => response.json().error.code)).toEqual(Array(4).fill('VALIDATION_FAILED'));
    expect(MAIL.sent).toHaveLength(0);

    await send({ email: 'alex@brightpath.sg', to: 'attacker@evil.test', cc: 'attacker@evil.test' });
    expect(MAIL.sent.map(mail => mail.to)).toEqual(['alex@brightpath.sg']);
  });

  it('escapes the account name in the HTML email', async () => {
    const created = await api(app, {
      method: 'POST',
      url: '/api/recruiter/sign-up',
      payload: { email: 'mallory@agency.sg', name: '<img src=x onerror=alert(1)>', company: 'Agency', password: 'Recruiter123!' },
    });
    expect(created.statusCode).toBe(201);

    await api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email: 'mallory@agency.sg' } });

    expect(MAIL.sent[0].html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(MAIL.sent[0].html).not.toContain('<img');
  });

  it('lets only one of two simultaneous resets with the same link succeed', async () => {
    await createRecruiterAccount(app, admin);
    await api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email: 'alex@brightpath.sg' } });
    const token = lastResetToken();

    const results = await Promise.all(
      ['FirstPassword1', 'SecondPassword2', 'ThirdPassword3'].map(password =>
        api(app, { method: 'POST', url: '/api/recruiter/auth/reset-password', payload: { token, password } }),
      ),
    );

    expect(results.map(response => response.statusCode).toSorted()).toEqual([204, 400, 400]);
    const winner = ['FirstPassword1', 'SecondPassword2', 'ThirdPassword3'][results.findIndex(response => response.statusCode === 204)];
    const login = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'alex@brightpath.sg', password: winner } });
    expect(login.statusCode).toBe(200);
  });

  it('keeps the raw token out of the database and the audit log', async () => {
    await createRecruiterAccount(app, admin);
    await api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email: 'alex@brightpath.sg' } });
    const token = lastResetToken();
    await api(app, { method: 'POST', url: '/api/recruiter/auth/reset-password', payload: { token, password: 'NewPassword123' } });

    const tokens = await query(pool, 'SELECT * FROM password_reset_tokens');
    const audits = await query(pool, 'SELECT * FROM audit_logs');
    expect(JSON.stringify(tokens)).not.toContain(token);
    expect(JSON.stringify(audits)).not.toContain(token);
    expect(JSON.stringify(audits)).not.toContain('NewPassword123');
  });

  it('signs out every session that existed before the reset, even one from the same second, for recruiters and admins', async () => {
    const recruiter = await createRecruiterAccount(app, admin);
    const before = await api(app, { method: 'GET', url: '/api/recruiter/auth/me', cookie: recruiter.cookie });
    expect(before.statusCode).toBe(200);

    await api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email: 'alex@brightpath.sg' } });
    const reset = await api(app, { method: 'POST', url: '/api/recruiter/auth/reset-password', payload: { token: lastResetToken(), password: 'NewPassword123' } });
    expect(reset.cookies.find(cookie => cookie.name === COOKIE.recruiter)?.value).toBe('');

    const oldSession = await api(app, { method: 'GET', url: '/api/recruiter/auth/me', cookie: recruiter.cookie });
    expect(oldSession.statusCode).toBe(401);
    const oldSessionFeature = await api(app, { method: 'GET', url: '/api/recruiter/locks', cookie: recruiter.cookie });
    expect(oldSessionFeature.statusCode).toBe(401);

    const login = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'alex@brightpath.sg', password: 'NewPassword123' } });
    const fresh = { [COOKIE.recruiter]: cookieOf(login, COOKIE.recruiter) };
    expect((await api(app, { method: 'GET', url: '/api/recruiter/auth/me', cookie: fresh })).statusCode).toBe(200);

    await api(app, { method: 'POST', url: '/api/admin/auth/forgot-password', payload: { email: 'admin@example.com' } });
    await api(app, { method: 'POST', url: '/api/admin/auth/reset-password', payload: { token: lastResetToken(), password: 'NewPassword123' } });
    expect((await api(app, { method: 'GET', url: '/api/admin/auth/me', cookie: admin })).statusCode).toBe(401);
  }, 20000);

  it('keeps the session of a user who changes their own password but signs out their other sessions', async () => {
    const recruiter = await createRecruiterAccount(app, admin);
    const second = await api(app, { method: 'POST', url: '/api/recruiter/auth/login', payload: { email: 'alex@brightpath.sg', password: recruiter.temporaryPassword } });
    const otherDevice = { [COOKIE.recruiter]: cookieOf(second, COOKIE.recruiter) };

    const changed = await api(app, {
      method: 'POST',
      url: '/api/recruiter/change-password',
      cookie: recruiter.cookie,
      payload: { currentPassword: recruiter.temporaryPassword, newPassword: 'NewPassword123' },
    });
    expect(changed.statusCode).toBe(204);

    const renewed = { [COOKIE.recruiter]: cookieOf(changed, COOKIE.recruiter) };
    expect((await api(app, { method: 'GET', url: '/api/recruiter/auth/me', cookie: renewed })).statusCode).toBe(200);
    expect((await api(app, { method: 'GET', url: '/api/recruiter/auth/me', cookie: otherDevice })).statusCode).toBe(401);
  }, 20000);

  it('sends at most three links per account even when many requests arrive at once', async () => {
    await createRecruiterAccount(app, admin);

    await Promise.all(
      Array.from({ length: 8 }, () => api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email: 'alex@brightpath.sg' } })),
    );

    expect(MAIL.sent).toHaveLength(3);
    expect(await query(pool, 'SELECT id FROM password_reset_tokens')).toHaveLength(3);
  });

  it('voids open reset links when the password changes any other way', async () => {
    const recruiter = await createRecruiterAccount(app, admin);
    await api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email: 'alex@brightpath.sg' } });
    const beforeChange = lastResetToken();

    const changed = await api(app, {
      method: 'POST',
      url: '/api/recruiter/change-password',
      cookie: recruiter.cookie,
      payload: { currentPassword: recruiter.temporaryPassword, newPassword: 'NewPassword123' },
    });
    expect(changed.statusCode).toBe(204);
    const afterChange = await api(app, { method: 'POST', url: '/api/recruiter/auth/reset-password', payload: { token: beforeChange, password: 'Attacker12345' } });
    expect(afterChange.json().error.code).toBe('RESET_LINK_INVALID');

    await api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email: 'alex@brightpath.sg' } });
    const beforeAdminReset = lastResetToken();
    await api(app, { method: 'POST', url: `/api/admin/recruiters/${recruiter.id}/reset-password`, cookie: admin });
    const afterAdminReset = await api(app, { method: 'POST', url: '/api/recruiter/auth/reset-password', payload: { token: beforeAdminReset, password: 'Attacker12345' } });
    expect(afterAdminReset.json().error.code).toBe('RESET_LINK_INVALID');
  });

  it('removes spent and expired links older than a day when the account asks again', async () => {
    await createRecruiterAccount(app, admin);
    await api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email: 'alex@brightpath.sg' } });
    await execute(pool, "UPDATE password_reset_tokens SET created_at = created_at - INTERVAL '2 days', expires_at = expires_at - INTERVAL '2 days'");

    await api(app, { method: 'POST', url: '/api/recruiter/auth/forgot-password', payload: { email: 'alex@brightpath.sg' } });

    expect(await query(pool, 'SELECT id FROM password_reset_tokens')).toHaveLength(1);
  });

  it('refuses a plain-http portal address in production', async () => {
    const { loadConfig } = await import('../src/common/config/index.js');

    expect(() => loadConfig({ ...process.env, NODE_ENV: 'production', PORTAL_BASE_URL: 'http://portal.test' })).toThrow(/https/);
    expect(loadConfig({ ...process.env, NODE_ENV: 'production', PORTAL_BASE_URL: 'https://portal.test/' }).portalBaseUrl).toBe('https://portal.test');
  });
});
