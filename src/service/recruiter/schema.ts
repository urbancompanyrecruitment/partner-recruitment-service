import { z } from 'zod';
import { passwordSchema } from '../../common/auth/schema.js';
import { EMAIL_MAX_LENGTH, NAME_MAX_LENGTH } from './constant.js';
import { RecruiterStatus } from './interface.js';

const emailSchema = z.string().trim().toLowerCase().email().max(EMAIL_MAX_LENGTH);

export const recruiterLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const createRecruiterSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  company: z.string().trim().min(1).max(NAME_MAX_LENGTH),
});

export const recruiterSignUpSchema = createRecruiterSchema.extend({ password: passwordSchema });

export const recruiterStatusSchema = z.object({
  status: z.enum([RecruiterStatus.Active, RecruiterStatus.Suspended, RecruiterStatus.Rejected]),
});
