import { NON_DIGITS, PHONE_PATTERN, PHONE_PREFIX, SINGAPORE_PHONE_PATTERN } from './constant.js';

export const normalisePhone = (raw: string): string => `${PHONE_PREFIX}${raw.replace(NON_DIGITS, '')}`;

export const isValidPhone = (normalised: string): boolean => PHONE_PATTERN.test(normalised);

export const isValidSingaporePhone = (normalised: string): boolean => SINGAPORE_PHONE_PATTERN.test(normalised);
