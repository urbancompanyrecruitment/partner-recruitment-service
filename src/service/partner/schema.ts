import { z } from 'zod';
import {
  COUNTRY_MAX_LENGTH,
  MAX_PARTNER_AGE,
  MIN_PARTNER_AGE,
  NAME_MAX_LENGTH,
  NAME_PART_MAX_LENGTH,
  NAME_SEPARATOR,
  WHITESPACE_RUN,
} from './constant.js';
import { CookingFrequency, PartnerCountry, RecruitmentSource } from './interface.js';

const optionalText = (maxLength: number) =>
  z.preprocess(value => (typeof value === 'string' && value.trim() ? value.trim() : undefined), z.string().max(maxLength).optional());

const namePartSchema = z
  .string()
  .trim()
  .min(1)
  .max(NAME_PART_MAX_LENGTH)
  .transform(value => value.replace(WHITESPACE_RUN, NAME_SEPARATOR));

export const recruiterPartnerSchema = z.object({
  firstName: namePartSchema,
  lastName: namePartSchema,
  primaryPhone: z.string().trim().min(1),
  singaporePhone: optionalText(32),
  country: z.enum(PartnerCountry),
  city: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  nationality: z.string().trim().min(1).max(COUNTRY_MAX_LENGTH),
  age: z.number().int().min(MIN_PARTNER_AGE).max(MAX_PARTNER_AGE),
  comfortableWithDogs: z.boolean(),
  deepCleaningExperience: z.boolean(),
  cookingFrequency: z.enum(CookingFrequency),
  consent: z.literal(true),
  interviewCity: z.string().trim().min(1),
  slotId: z.string().trim().min(1),
});

export const signUpSchema = recruiterPartnerSchema.extend({
  source: z.enum(RecruitmentSource),
  referrer: optionalText(NAME_MAX_LENGTH),
});

export const loginSchema = z.object({
  primaryPhone: z.string().trim().min(1),
  lastName: namePartSchema,
});

export const rescheduleSchema = z.object({
  interviewCity: z.string().trim().min(1),
  slotId: z.string().trim().min(1),
});
