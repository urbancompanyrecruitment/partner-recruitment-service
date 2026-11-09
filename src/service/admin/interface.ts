import type { z } from 'zod';
import type { googleLoginSchema, partnerFiltersSchema, singaporePhoneSchema } from './schema.js';

export interface GoogleIdentity {
  id: string;
  email: string;
  name: string;
}

export interface AdminView {
  id: string;
  name: string;
  email: string;
}

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

export type SingaporePhoneInput = z.infer<typeof singaporePhoneSchema>;

export type PartnerFiltersInput = z.infer<typeof partnerFiltersSchema>;

export interface TemporaryPasswordResult {
  temporaryPassword: string;
}
