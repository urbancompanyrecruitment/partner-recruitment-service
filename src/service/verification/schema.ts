import { z } from 'zod';
import { FILE_NAME_MAX_LENGTH, MAX_IMPORT_ROWS, RAW_PHONE_MAX_LENGTH, RAW_VERIFIED_MAX_LENGTH } from './constant.js';

export const importSchema = z.object({
  fileName: z.string().trim().min(1).max(FILE_NAME_MAX_LENGTH),
  rows: z
    .array(
      z.object({
        primaryPhone: z.string().trim().max(RAW_PHONE_MAX_LENGTH),
        verified: z.string().trim().max(RAW_VERIFIED_MAX_LENGTH),
      }),
    )
    .min(1)
    .max(MAX_IMPORT_ROWS),
});

export const importParamsSchema = z.object({ importId: z.string().uuid() });
