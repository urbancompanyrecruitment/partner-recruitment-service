import type { App } from '../src/app.js';
import { execute, pool, query } from '../src/common/db/index.js';
import { INTERVIEW_CENTRES, type SlotDefinitionRow } from '../src/service/interview/index.js';
import { api, closeDatabase, createAdminAccount, createApp, createRecruiterAccount, prepareDatabase, resetDatabase } from './helpers.js';

const SINGAPORE = INTERVIEW_CENTRES[0];

const YANGON = INTERVIEW_CENTRES[1];

const row = (centre: string, startTime: string, endTime: string, capacity: string) => ({ centre, startTime, endTime, capacity });

describe('interview centres and slot upload', () => {
  let app: App;
  let admin: Record<string, string>;
  let seeded: SlotDefinitionRow[];

  const upload = (rows: Array<ReturnType<typeof row>>, cookie: Record<string, string> | undefined = admin) =>
    api(app, { method: 'POST', url: '/api/admin/slot-imports', cookie, payload: { fileName: 'slots.csv', rows } });

  const slotsOf = (cityKey: string) =>
    query<SlotDefinitionRow>(pool, 'SELECT * FROM interview_slots WHERE city_key = ? ORDER BY start_time', [cityKey]);

  beforeAll(async () => {
    await prepareDatabase();

    app = await createApp();

    seeded = await query<SlotDefinitionRow>(pool, 'SELECT * FROM interview_slots');
  });

  beforeEach(async () => {
    await resetDatabase();

    admin = (await createAdminAccount(app)).cookie;
  });

  afterEach(async () => {
    await execute(pool, 'DELETE FROM interview_slots WHERE id <> ALL(?)', [seeded.map(slot => slot.id)]);

    await seeded.reduce(
      (chain, slot) =>
        chain.then(() =>
          execute(
            pool,
            `UPDATE interview_slots
             SET country = ?, city_name = ?, centre = ?, address = ?, time_zone = ?, end_time = ?, capacity = ?, is_active = ?
             WHERE id = ?`,
            [slot.country, slot.city_name, slot.centre, slot.address, slot.time_zone, slot.end_time, slot.capacity, slot.is_active, slot.id],
          ),
        ),
      Promise.resolve<unknown>(undefined),
    );
  });

  afterAll(async () => {
    await app.close();

    await closeDatabase();
  });

  it('lists the valid interview centres with their upload value and address', async () => {
    const centres = await api(app, { method: 'GET', url: '/api/admin/interview-centres', cookie: admin });
    const anonymous = await api(app, { method: 'GET', url: '/api/admin/interview-centres' });

    expect(centres.json()).toEqual([
      expect.objectContaining({ key: 'singapore', country: 'Singapore', address: '33 Maude Road #02-01, Singapore 208344', timeZone: 'Asia/Singapore' }),
      expect.objectContaining({ key: 'yangon', country: 'Myanmar', address: 'Ye Tagon Tower (Pang Hlaing Tower), Pann Hlaing St, Yangon, Myanmar', timeZone: 'Asia/Yangon' }),
    ]);
    expect(anonymous.statusCode).toBe(401);
  });

  it('offers only the two valid centres after the migrations, each with hourly slots', async () => {
    const active = await query(pool, 'SELECT city_key, centre, address, COUNT(*) AS slots FROM interview_slots WHERE is_active GROUP BY city_key, centre, address ORDER BY city_key');

    expect(active).toEqual([
      { city_key: 'singapore', centre: SINGAPORE.name, address: SINGAPORE.address, slots: 10 },
      { city_key: 'yangon', centre: YANGON.name, address: YANGON.address, slots: 10 },
    ]);
  });

  it('creates slots for a valid centre with the uploaded start and end time and offers them to partners', async () => {
    const uploaded = await upload([row('singapore', '19:00', '20:30', '6'), row(' Singapore Interview Centre ', '6:15', '7:00', '3')]);
    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json().counts).toEqual({ rows: 2, created: 2, updated: 0, errors: 0 });
    expect(uploaded.json().rows.map((item: { outcome: string }) => item.outcome)).toEqual(['created', 'created']);
    expect(uploaded.json().rows[0]).toMatchObject({ rowNumber: 1, centre: 'singapore', startTime: '19:00', endTime: '20:30', capacity: '6' });

    const slots = await slotsOf('singapore');
    expect(slots).toHaveLength(12);
    expect(slots.filter(slot => ['06:15:00', '19:00:00'].includes(slot.start_time)).map(slot => [slot.start_time, slot.end_time, slot.capacity, slot.is_active])).toEqual([
      ['06:15:00', '07:00:00', 3, true],
      ['19:00:00', '20:30:00', 6, true],
    ]);
    expect(slots.at(-1)).toMatchObject({ country: 'Singapore', city_name: 'Singapore', centre: SINGAPORE.name, address: SINGAPORE.address, time_zone: 'Asia/Singapore' });

    const cities = await api(app, { method: 'GET', url: '/api/partner/interview-cities?country=Singapore' });
    expect(cities.json()).toEqual([expect.objectContaining({ key: 'singapore', centre: SINGAPORE.name, address: SINGAPORE.address })]);

    const bookable = await api(app, { method: 'GET', url: '/api/partner/interview-slots?cityKey=singapore' });
    const evening = bookable.json().find((slot: { time: string }) => slot.time === '19:00');
    expect(evening).toMatchObject({ capacity: 6, seatsLeft: 6 });
  });

  it('does not create a slot for a centre outside the list, or with a bad time or capacity, and reports each row', async () => {
    const before = await query(pool, 'SELECT id FROM interview_slots');
    const uploaded = await upload([
      row('Tampines', '19:00', '20:00', '4'),
      row('UC Jurong East Centre', '19:00', '20:00', '4'),
      row('singapore', '25:00', '26:00', '4'),
      row('singapore', '19:00', '19:00', '4'),
      row('singapore', '19:00', '18:00', '4'),
      row('singapore', '19:00', '', '4'),
      row('singapore', '19:00', '20:00', '0'),
      row('singapore', '19:00', '20:00', 'four'),
      row('singapore', '20:00', '21:00', '5'),
      row('SINGAPORE', '20:00', '22:00', '8'),
      row('', '21:00', '22:00', '4'),
    ]);
    const after = await query(pool, 'SELECT id FROM interview_slots');

    expect(uploaded.json().counts).toEqual({ rows: 11, created: 1, updated: 0, errors: 10 });
    expect(uploaded.json().rows.map((item: { outcome: string }) => item.outcome)).toEqual([
      'unknown_centre',
      'unknown_centre',
      'invalid_time',
      'invalid_end_time',
      'invalid_end_time',
      'invalid_end_time',
      'invalid_capacity',
      'invalid_capacity',
      'created',
      'duplicate_in_file',
      'unknown_centre',
    ]);
    expect(after).toHaveLength(before.length + 1);
    expect((await slotsOf('singapore')).filter(slot => slot.start_time >= '19:00:00').map(slot => [slot.start_time, slot.end_time, slot.capacity])).toEqual([
      ['20:00:00', '21:00:00', 5],
    ]);
    expect(await slotsOf('tampines')).toHaveLength(10);
    expect((await slotsOf('tampines')).every(slot => !slot.is_active)).toBe(true);
  });

  it('updates a slot that already exists and brings every slot of that city in line with the listed centre', async () => {
    const before = await slotsOf('yangon');

    await execute(pool, "UPDATE interview_slots SET centre = 'Old name', address = 'Old address' WHERE city_key = ?", ['yangon']);

    await execute(pool, 'UPDATE interview_slots SET is_active = FALSE WHERE city_key = ? AND start_time = ?', ['yangon', '09:00:00']);

    const uploaded = await upload([row('yangon', '09:00', '09:45', '10')]);
    const after = await slotsOf('yangon');

    expect(uploaded.json().counts).toEqual({ rows: 1, created: 0, updated: 1, errors: 0 });
    expect(after).toHaveLength(before.length);
    expect(after.find(slot => slot.start_time === '09:00:00')).toMatchObject({ end_time: '09:45:00', capacity: 10, is_active: true });
    expect(after.every(slot => slot.centre === YANGON.name && slot.address === YANGON.address)).toBe(true);
    expect(after.filter(slot => slot.start_time !== '09:00:00').every(slot => slot.capacity === 4)).toBe(true);
  });

  it('is for admins only, validates the file and records one audit row per upload', async () => {
    const recruiter = await createRecruiterAccount(app, admin, 'alex@brightpath.sg');
    const anonymous = await upload([row('singapore', '19:00', '20:00', '4')], {});
    const byRecruiter = await upload([row('singapore', '19:00', '20:00', '4')], recruiter.cookie);
    const empty = await upload([]);
    expect(anonymous.statusCode).toBe(401);
    expect(byRecruiter.statusCode).toBe(401);
    expect(empty.json().error.code).toBe('VALIDATION_FAILED');
    expect(await slotsOf('singapore')).toHaveLength(10);

    await upload([row('singapore', '19:00', '20:00', '4'), row('nowhere', '19:00', '20:00', '4')]);

    const audits = await query(pool, "SELECT actor_type, entity_type, data FROM audit_logs WHERE action = 'slots.imported'");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor_type: 'admin', entity_type: 'import', data: { fileName: 'slots.csv', rows: 2, created: 1, updated: 0, errors: 1 } });
  });
});
