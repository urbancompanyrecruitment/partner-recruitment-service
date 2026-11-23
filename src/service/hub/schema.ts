import { z } from 'zod';
import { HUB_NAME_MAX_LENGTH } from '../partner/index.js';
import { FILE_NAME_MAX_LENGTH, MAX_IMPORT_ROWS, RAW_PHONE_MAX_LENGTH } from '../verification/index.js';

export const hubImportSchema = z.object({
  fileName: z.string().trim().min(1).max(FILE_NAME_MAX_LENGTH),
  rows: z
    .array(
      z.object({
        primaryPhone: z.string().trim().max(RAW_PHONE_MAX_LENGTH),
        hubName: z.string().trim().max(HUB_NAME_MAX_LENGTH),
      }),
    )
    .min(1)
    .max(MAX_IMPORT_ROWS),
});
