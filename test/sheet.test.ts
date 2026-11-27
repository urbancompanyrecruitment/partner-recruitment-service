const SHEET = vi.hoisted(() => {
  const webhook = { url: 'https://sheet.test/exec', secret: 'sheet-secret' };

  process.env.SIGNUP_SHEET_WEBHOOK_URL = webhook.url;
  process.env.SIGNUP_SHEET_WEBHOOK_SECRET = webhook.secret;

  return webhook;
});

import type { App } from '../src/buildApp.js';
import { pool, query } from '../src/common/db/index.js';
import { SHEET_HEADERS } from '../src/service/partner/constant.js';
import { syncPendingPartnersToSheet } from '../src/service/partner/index.js';
import { closeDatabase, createApp, prepareDatabase, resetDatabase, signUp } from './helpers.js';

interface SheetPayload {
  secret: string;
  headers: string[];
  values: string[];
}

const syncedCount = async (): Promise<number> =>
  Number((await query(pool, 'SELECT COUNT(*) AS total FROM partners WHERE sheet_synced_at IS NOT NULL'))[0].total);

describe('sign-up sheet', () => {
  let app: App;
  let received: SheetPayload[];
  let sheetAccepts: boolean;

  beforeAll(async () => {
    await prepareDatabase();

    app = await createApp();
  });

  beforeEach(async () => {
    await resetDatabase();

    received = [];
    sheetAccepts = true;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url !== SHEET.url) throw new Error(`Unexpected request to ${url}`);

        received.push(JSON.parse(String(init.body)));

        return new Response(JSON.stringify({ ok: sheetAccepts }), { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();

    delete process.env.SIGNUP_SHEET_WEBHOOK_URL;
    delete process.env.SIGNUP_SHEET_WEBHOOK_SECRET;

    await app.close();

    await closeDatabase();
  });

  it('sends every submitted detail to the sheet, once per sign-up', async () => {
    const created = await signUp(app, { singaporePhone: '+65 9123 4567', country: 'Myanmar', city: 'Yangon', interviewCity: 'yangon', source: 'referral', referrer: 'Thandar' });
    expect(created.statusCode).toBe(201);

    await vi.waitFor(async () => expect(await syncedCount()).toBe(1));

    expect(received).toHaveLength(1);
    expect(received[0].secret).toBe(SHEET.secret);
    expect(received[0].headers).toEqual(SHEET_HEADERS);
    expect(received[0].values).toHaveLength(SHEET_HEADERS.length);

    const row = Object.fromEntries(received[0].headers.map((header, index) => [header, received[0].values[index]]));
    expect(row).toMatchObject({
      'Candidate ID': created.json().partner.id,
      Name: 'Test Partner',
      'Primary mobile': '+9598760000',
      'Singapore mobile': '+6591234567',
      'Current country': 'Myanmar',
      'Current city': 'Yangon',
      Nationality: 'Myanmar',
      Age: '30',
      Source: 'referral',
      Referrer: 'Thandar',
      'Interview country': 'Myanmar',
      'Interview city': 'Yangon',
      'Registered by recruiter': '',
    });
    expect(row['Interview slot']).toContain('Asia/Yangon');
    expect(received[0].headers.join(' ').toLowerCase()).not.toMatch(/password|email/);

    expect(await syncPendingPartnersToSheet()).toBe(0);
    expect(received).toHaveLength(1);
  });

  it('keeps the sign-up when the sheet refuses the row and sends it on the next sync', async () => {
    sheetAccepts = false;

    const created = await signUp(app);
    expect(created.statusCode).toBe(201);

    await vi.waitFor(() => expect(received).toHaveLength(1));

    expect(await syncedCount()).toBe(0);

    sheetAccepts = true;

    expect(await syncPendingPartnersToSheet()).toBe(1);
    expect(await syncedCount()).toBe(1);
    expect(received[1].values[received[1].headers.indexOf('Name')]).toBe('Test Partner');
  });
});
