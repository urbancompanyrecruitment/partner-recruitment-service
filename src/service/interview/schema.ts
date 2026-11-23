import { z } from 'zod';
import { MAX_SLOT_IMPORT_ROWS, SLOT_FILE_NAME_MAX_LENGTH, SLOT_UPLOAD_VALUE_MAX_LENGTH } from './constant.js';

const uploadValueSchema = z.string().trim().max(SLOT_UPLOAD_VALUE_MAX_LENGTH);

export const slotImportSchema = z.object({
  fileName: z.string().trim().min(1).max(SLOT_FILE_NAME_MAX_LENGTH),
  rows: z
    .array(z.object({ centre: uploadValueSchema, startTime: uploadValueSchema, endTime: uploadValueSchema, capacity: uploadValueSchema }))
    .min(1)
    .max(MAX_SLOT_IMPORT_ROWS),
});
