import { z } from 'zod';
import { AGGREGATOR_NAME_MAX_LENGTH, WHITESPACE_RUN } from './constant.js';

export const addAggregatorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(AGGREGATOR_NAME_MAX_LENGTH)
    .transform(value => value.replace(WHITESPACE_RUN, ' ')),
});

export const aggregatorParamsSchema = z.object({ recruiterId: z.string().uuid(), aggregatorId: z.string().uuid() });
