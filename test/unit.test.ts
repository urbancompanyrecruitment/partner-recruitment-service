import { nextLoginFailure } from '../src/common/auth/lockout.js';
import { LOGIN_MAX_FAILURES } from '../src/common/auth/constant.js';
import { toCsv, toPlainCsv } from '../src/common/csv.js';
import { decryptPii, encryptPii, piiChecksum } from '../src/common/crypto/pii.js';
import { isValidPhone, isValidSingaporePhone, normalisePhone } from '../src/common/phone/index.js';
import { dayjs } from '../src/common/time.js';
import { citiesOf, generateSlots, slotIdOf, type SlotDefinitionRow } from '../src/service/interview/index.js';

const definition = (id: string, country: string, cityKey: string, timeZone: string, startTime: string): SlotDefinitionRow =>
  ({
    id,
    country,
    city_key: cityKey,
    city_name: cityKey,
    centre: `${cityKey} centre`,
    address: 'Address',
    instructions: 'Bring your ID',
    time_zone: timeZone,
    start_time: startTime,
    end_time: startTime,
    capacity: 4,
    is_active: true,
  }) as SlotDefinitionRow;

const DEFINITIONS = [
  definition('slot-1', 'Singapore', 'tampines', 'Asia/Singapore', '09:00:00'),
  definition('slot-2', 'Singapore', 'tampines', 'Asia/Singapore', '11:00:00'),
  definition('slot-3', 'Myanmar', 'yangon', 'Asia/Yangon', '09:00:00'),
];

describe('slots', () => {
  it('turns the daily slot definitions into dated slots for today and the next two days, future starts only', () => {
    const now = dayjs.tz('2026-10-27 10:00:00', 'Asia/Singapore');
    const slots = generateSlots(DEFINITIONS, now);
    const tampines = slots.filter(slot => slot.cityKey === 'tampines');
    const yangon = slots.filter(slot => slot.cityKey === 'yangon');

    expect(tampines.map(slot => slot.id)).toEqual([
      'tampines_2026-10-27_11:00',
      'tampines_2026-10-28_09:00',
      'tampines_2026-10-28_11:00',
      'tampines_2026-10-29_09:00',
      'tampines_2026-10-29_11:00',
    ]);
    expect(tampines[0]).toMatchObject({ definitionId: 'slot-2', startsAt: '2026-10-27 11:00:00', timeZone: 'Asia/Singapore', capacity: 4 });
    expect(yangon.map(slot => slot.id)).toEqual(['yangon_2026-10-27_09:00', 'yangon_2026-10-28_09:00', 'yangon_2026-10-29_09:00']);
    expect(yangon[0].timeZone).toBe('Asia/Yangon');
    expect(slotIdOf('bedok', '2026-10-30 14:00:00')).toBe('bedok_2026-10-30_14:00');
  });

  it('lists each city once and filters by country, with Others meaning every city', () => {
    expect(citiesOf(DEFINITIONS).map(city => city.key)).toEqual(['tampines', 'yangon']);
    expect(citiesOf(DEFINITIONS, 'Myanmar').map(city => city.key)).toEqual(['yangon']);
    expect(citiesOf(DEFINITIONS, 'Singapore')[0]).toMatchObject({ key: 'tampines', country: 'Singapore', centre: 'tampines centre' });
    expect(citiesOf(DEFINITIONS, 'Others').map(city => city.key)).toEqual(['tampines', 'yangon']);
  });
});

describe('phones', () => {
  it('normalises, validates and encrypts phone numbers deterministically for lookups', () => {
    expect(normalisePhone('+65 9123-4567')).toBe('+6591234567');
    expect(isValidPhone('+6591234567')).toBe(true);
    expect(isValidPhone('+1')).toBe(false);
    expect(isValidSingaporePhone('+6591234567')).toBe(true);
    expect(isValidSingaporePhone('+6512345678')).toBe(false);

    const encrypted = encryptPii('+6591234567');
    expect(decryptPii(encrypted)).toBe('+6591234567');
    expect(encrypted.equals(encryptPii('+6591234567'))).toBe(false);
    expect(piiChecksum('+6591234567')).toBe(piiChecksum('+6591234567'));
    expect(piiChecksum('+6591234567')).toHaveLength(64);
  });
});

describe('lockout', () => {
  it('locks only once the failure limit is reached', () => {
    expect(nextLoginFailure(0)).toEqual({ failedCount: 1, lockedUntil: null });
    expect(nextLoginFailure(LOGIN_MAX_FAILURES - 1).lockedUntil).toBeInstanceOf(Date);
  });
});

describe('csv', () => {
  it('quotes cells and escapes quotes', () => {
    expect(toCsv([['a', 'b'], ['x "y"', 1]])).toBe('﻿"a","b"\r\n"x ""y""","1"');
  });

  it('writes a plain file without a byte order mark and quotes only the cells that need it', () => {
    expect(toPlainCsv([['name', 'phone'], ['Tan, Mei "May"', 91234567]])).toBe('name,phone\r\n"Tan, Mei ""May""",91234567');
  });
});
