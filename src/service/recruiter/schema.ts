import { z } from 'zod';
import { EMAIL_MAX_LENGTH, NAME_MAX_LENGTH } from './constant.js';
import { RecruiterStatus } from './interface.js';

export const recruiterLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(EMAIL_MAX_LENGTH),
  password: z.string().min(1),
});

export const createRecruiterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(EMAIL_MAX_LENGTH),
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  company: z.string().trim().min(1).max(NAME_MAX_LENGTH),
});

export const recruiterStatusSchema = z.object({ status: z.enum(RecruiterStatus) });
