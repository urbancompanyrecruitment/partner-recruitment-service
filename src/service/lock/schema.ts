import { z } from 'zod';
import { ISO_DATE_FORMAT, dayjs } from '../../common/time.js';
import { EMPLOYER_NAME_MAX_LENGTH } from './constant.js';

export const placementSchema = z.object({
  employerName: z.string().trim().min(1).max(EMPLOYER_NAME_MAX_LENGTH),
  startDate: z
    .string()
    .trim()
    .refine(value => dayjs(value, ISO_DATE_FORMAT, true).isValid(), { message: 'Use YYYY-MM-DD' }),
});
