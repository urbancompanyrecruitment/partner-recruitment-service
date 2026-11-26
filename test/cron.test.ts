import type { App } from '../src/buildApp.js';
import { config } from '../src/common/config/index.js';
import { api, closeDatabase, createApp, prepareDatabase, resetDatabase } from './helpers.js';

const CRON_URL = '/api/cron/deactivate-expired-locks';

describe('scheduled lock clean-up endpoint', () => {
  let app: App;

  beforeAll(async () => {
    await prepareDatabase();

    app = await createApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();

    await closeDatabase();
  });

  it('refuses a call without the cron secret', async () => {
    const missing = await api(app, { method: 'GET', url: CRON_URL });
    const wrong = await api(app, { method: 'GET', url: CRON_URL, headers: { authorization: 'Bearer not-the-cron-secret' } });
    const bare = await api(app, { method: 'GET', url: CRON_URL, headers: { authorization: config.cronSecret } });

    expect(missing.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(bare.statusCode).toBe(401);
  });

  it('runs the clean-up when the scheduler sends the secret as a bearer token', async () => {
    const response = await api(app, { method: 'GET', url: CRON_URL, headers: { authorization: `Bearer ${config.cronSecret}` } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ deactivated: 0 });
  });
});
