import { nextLoginFailure } from '../src/common/auth/lockout.js';
import { LOGIN_MAX_FAILURES } from '../src/common/auth/constant.js';
import { toCsv } from '../src/common/csv.js';
import { decryptPii, encryptPii, piiChecksum } from '../src/common/crypto/pii.js';
import { isValidPhone, isValidSingaporePhone, normalisePhone } from '../src/common/phone/index.js';
import { dayjs } from '../src/common/time.js';
import { generateSlots, slotIdOf } from '../src/service/interview/index.js';
import { INTERVIEW_CITIES } from '../src/service/interview/constant.js';

describe('slots', () => {
  it('generates hourly slots per city for today and the next two days, future starts only', () => {
    const now = dayjs.tz('2026-10-27 10:00:00', 'Asia/Singapore');
    const slots = generateSlots(now);
    const tampines = slots.filter(slot => slot.cityKey === 'tampines');

    expect(slots).toHaveLength(INTERVIEW_CITIES.length * (7 + 10 + 10));
    expect(tampines[0]).toMatchObject({ id: 'tampines_2026-10-27_11:00', startsAt: '2026-10-27 11:00:00', timeZone: 'Asia/Singapore' });
    expect(tampines.at(-1)).toMatchObject({ date: '2026-10-29', time: '17:00' });
    expect(slotIdOf('bedok', '2026-10-30 14:00:00')).toBe('bedok_2026-10-30_14:00');
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
});
