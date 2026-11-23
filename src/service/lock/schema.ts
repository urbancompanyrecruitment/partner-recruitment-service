import { z } from 'zod';
import { ISO_DATE_FORMAT, dayjs } from '../../common/time.js';

export const placementSchema = z.object({
  aggregatorId: z.string().uuid(),
  startDate: z
    .string()
    .trim()
    .refine(value => dayjs(value, ISO_DATE_FORMAT, true).isValid(), { message: 'Use YYYY-MM-DD' }),
});

export const assignRecruiterSchema = z.object({ recruiterId: z.string().uuid() });
