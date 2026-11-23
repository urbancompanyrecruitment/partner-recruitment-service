import { z } from 'zod';
import { PartnerState, RecruitmentSource } from '../partner/index.js';
import { EMAIL_MAX_LENGTH, NAME_MAX_LENGTH } from './constant.js';
import { AdminRole, AdminStatus } from './interface.js';

const emailSchema = z.string().trim().toLowerCase().email().max(EMAIL_MAX_LENGTH);

export const adminLoginSchema = z.object({ email: emailSchema, password: z.string().min(1) });

export const createAdminSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  role: z.enum(AdminRole).default(AdminRole.Admin),
});

export const adminStatusSchema = z.object({ status: z.enum(AdminStatus) });

export const adminParamsSchema = z.object({ adminId: z.string().uuid() });

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
