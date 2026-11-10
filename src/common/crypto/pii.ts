import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { config } from '../config/index.js';
import { CHECKSUM_ALGORITHM, PII_CIPHER, PII_IV_LENGTH, PII_TAG_LENGTH } from './constant.js';

export const encryptPii = (value: string): Buffer => {
  const iv = randomBytes(PII_IV_LENGTH);
  const cipher = createCipheriv(PII_CIPHER, config.phoneEncryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
};

export const decryptPii = (payload: Buffer): string => {
  const iv = payload.subarray(0, PII_IV_LENGTH);
  const tag = payload.subarray(PII_IV_LENGTH, PII_IV_LENGTH + PII_TAG_LENGTH);
  const encrypted = payload.subarray(PII_IV_LENGTH + PII_TAG_LENGTH);
  const decipher = createDecipheriv(PII_CIPHER, config.phoneEncryptionKey, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

export const decryptOptionalPii = (payload: Buffer | null): string | undefined =>
  payload ? decryptPii(payload) : undefined;

export const piiChecksum = (value: string): string =>
  createHmac(CHECKSUM_ALGORITHM, config.phoneChecksumKey).update(value).digest('hex');
