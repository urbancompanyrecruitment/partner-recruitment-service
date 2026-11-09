import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { config } from '../config/index.js';
import { CHECKSUM_ALGORITHM, PHONE_CIPHER, PHONE_IV_LENGTH, PHONE_TAG_LENGTH } from './constant.js';

export const encryptPhone = (phone: string): Buffer => {
  const iv = randomBytes(PHONE_IV_LENGTH);
  const cipher = createCipheriv(PHONE_CIPHER, config.phoneEncryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);

  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
};

export const decryptPhone = (payload: Buffer): string => {
  const iv = payload.subarray(0, PHONE_IV_LENGTH);
  const tag = payload.subarray(PHONE_IV_LENGTH, PHONE_IV_LENGTH + PHONE_TAG_LENGTH);
  const encrypted = payload.subarray(PHONE_IV_LENGTH + PHONE_TAG_LENGTH);
  const decipher = createDecipheriv(PHONE_CIPHER, config.phoneEncryptionKey, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

export const decryptOptionalPhone = (payload: Buffer | null): string | undefined =>
  payload ? decryptPhone(payload) : undefined;

export const phoneChecksum = (phone: string): string =>
  createHmac(CHECKSUM_ALGORITHM, config.phoneChecksumKey).update(phone).digest('hex');
