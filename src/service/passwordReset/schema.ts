import { z } from 'zod';
import { passwordSchema } from '../../common/auth/schema.js';
import { EMAIL_MAX_LENGTH } from '../recruiter/constant.js';
import { RESET_TOKEN_MAX_LENGTH } from './constant.js';

export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email().max(EMAIL_MAX_LENGTH) });

export const resetPasswordSchema = z.object({ token: z.string().trim().min(1).max(RESET_TOKEN_MAX_LENGTH), password: passwordSchema });
