import { z } from 'zod';
import {
  COUNTRY_MAX_LENGTH,
  MAX_PARTNER_AGE,
  MIN_PARTNER_AGE,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './constant.js';
import { CookingFrequency, RecruitmentSource } from './interface.js';

const optionalText = (maxLength: number) =>
  z.preprocess(value => (typeof value === 'string' && value.trim() ? value.trim() : undefined), z.string().max(maxLength).optional());

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const signUpSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  primaryPhone: z.string().trim().min(1),
  password: passwordSchema,
  singaporePhone: optionalText(32),
  country: z.string().trim().min(1).max(COUNTRY_MAX_LENGTH),
  city: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  nationality: z.string().trim().min(1).max(COUNTRY_MAX_LENGTH),
  age: z.number().int().min(MIN_PARTNER_AGE).max(MAX_PARTNER_AGE),
  source: z.enum(RecruitmentSource),
  referrer: optionalText(NAME_MAX_LENGTH),
  comfortableWithDogs: z.boolean(),
  deepCleaningExperience: z.boolean(),
  cookingFrequency: z.enum(CookingFrequency),
  consent: z.literal(true),
  interviewCity: z.string().trim().min(1),
  slotId: z.string().trim().min(1),
});

export const loginSchema = z.object({
  primaryPhone: z.string().trim().min(1),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
