import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { TEMPORARY_PASSWORD_BYTES } from './constant.js';

export const hashPassword = (password: string): Promise<string> => argon2.hash(password, { type: argon2.argon2id });

export const verifyPassword = (hash: string, password: string): Promise<boolean> =>
  argon2.verify(hash, password).catch(() => false);

export const generateTemporaryPassword = (): string => randomBytes(TEMPORARY_PASSWORD_BYTES).toString('base64url');
