import { z } from 'zod';
import { CookingFrequency, PartnerState, RecruitmentSource } from '../partner/index.js';

export const googleLoginSchema = z.object({ credential: z.string().min(1) });

export const singaporePhoneSchema = z.object({ singaporePhone: z.string().trim().min(1) });

export const partnerFiltersSchema = z.object({
  state: z.enum(PartnerState).optional(),
  cityKey: z.string().trim().min(1).optional(),
  source: z.enum(RecruitmentSource).optional(),
  hasSingaporePhone: z
    .enum(['true', 'false'])
    .optional()
    .transform(value => (value === undefined ? undefined : value === 'true')),
  q: z.string().trim().min(1).optional(),
});

export const partnerParamsSchema = z.object({ partnerId: z.string().uuid() });

export const recruiterParamsSchema = z.object({ recruiterId: z.string().uuid() });

export const occupancyQuerySchema = z.object({ cityKey: z.string().trim().min(1).optional() });

export const COOKING_FREQUENCIES = Object.values(CookingFrequency);
