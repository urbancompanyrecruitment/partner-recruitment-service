import type { z } from 'zod';
import type { ActorType } from '../audit/interface.js';
import type { InterviewSlot } from '../interview/interface.js';
import type { loginSchema, recruiterPartnerSchema, rescheduleSchema, signUpSchema } from './schema.js';

export enum PartnerState {
  SignedUp = 'signed_up',
  Verified = 'verified',
  VerificationFailed = 'verification_failed',
  Placed = 'placed',
  Joined = 'joined',
}

export enum PartnerStage {
  Registered = 'registered',
  Verified = 'verified',
  VerificationFailed = 'verification_failed',
  Placed = 'placed',
  Joined = 'joined',
}

export enum PartnerCountry {
  Singapore = 'Singapore',
  Myanmar = 'Myanmar',
  Others = 'Others',
}

export enum RecruitmentSource {
  TikTok = 'tiktok',
  Facebook = 'facebook',
  Referral = 'referral',
  Recruiter = 'recruiter',
  Aggregator = 'aggregator',
  Influencer = 'influencer',
  Direct = 'direct',
  Other = 'other',
}

export enum CookingFrequency {
  Never = 'never',
  Occasionally = 'occasionally',
  Frequently = 'frequently',
  VeryFrequently = 'very_frequently',
  Daily = 'daily',
}

export type SignUpInput = z.infer<typeof signUpSchema>;

export type RecruiterPartnerInput = z.infer<typeof recruiterPartnerSchema>;

export type LoginInput = z.infer<typeof loginSchema>;

export type RescheduleInput = z.infer<typeof rescheduleSchema>;

export interface PartnerRow {
  id: string;
  primary_phone_enc: Buffer;
  primary_phone_checksum: string;
  singapore_phone_enc: Buffer | null;
  failed_login_count: number;
  login_locked_until: string | null;
  last_login_at: string | null;
  full_name: string;
  last_name: string;
  current_country: string;
  current_city: string;
  nationality: string;
  age: number;
  source: RecruitmentSource;
  referrer_name: string | null;
  registered_by_recruiter_id: string | null;
  comfortable_with_dogs: boolean;
  deep_cleaning_experience: boolean;
  cooking_frequency: CookingFrequency;
  consent_accepted_at: string;
  consent_version: string;
  interview_city_key: string;
  state: PartnerState;
  lead_id: string | null;
  onboarding_journey_id: string | null;
  lead_created_at: string | null;
  approved_at: string | null;
  verified_at: string | null;
  verified_by_admin_id: string | null;
  verification_import_id: string | null;
  hub_name: string | null;
  hub_updated_at: string | null;
  sheet_synced_at: string | null;
  created_at: string;
  updated_at: string;
  booking_city_key: string | null;
  booking_starts_at: string | null;
  registered_by_name: string | null;
  registered_by_company: string | null;
}

export interface PartnerIdRow {
  id: string;
}

export interface PartnerOnboarding {
  leadId: string;
  journeyId?: string;
  leadCreatedAt: string;
  approvedAt?: string;
}

export interface PartnerRegistrar {
  recruiterId: string;
  name: string;
  company: string;
}

export interface PartnerView {
  id: string;
  name: string;
  primaryPhone?: string;
  singaporePhone?: string;
  hasSingaporePhone: boolean;
  country: string;
  city: string;
  nationality: string;
  age: number;
  source: RecruitmentSource;
  referrer?: string;
  registeredBy?: PartnerRegistrar;
  comfortableWithDogs: boolean;
  deepCleaningExperience: boolean;
  cookingFrequency: CookingFrequency;
  interviewCity: string;
  slotId?: string;
  state: PartnerState;
  stage: PartnerStage;
  verified: boolean;
  verifiedAt?: string;
  hubName?: string;
  onboarding?: PartnerOnboarding;
  createdAt: string;
}

export interface NewPartner {
  id: string;
  primaryPhone: string;
  singaporePhone?: string;
  name: string;
  lastName: string;
  country: string;
  city: string;
  nationality: string;
  age: number;
  source: RecruitmentSource;
  referrer?: string;
  registeredByRecruiterId?: string;
  comfortableWithDogs: boolean;
  deepCleaningExperience: boolean;
  cookingFrequency: CookingFrequency;
  interviewCity: string;
}

export interface PartnerListFilters {
  state?: PartnerState;
  cityKey?: string;
  source?: RecruitmentSource;
  hasSingaporePhone?: boolean;
  q?: string;
}

export interface VerificationDecision {
  adminId: string;
  importId: string;
  verified: boolean;
}

export interface SqlClause {
  sql: string;
  params: unknown[];
}

export interface TransitionActor {
  actorType: ActorType;
  actorId?: string;
}

export interface SignUpResult {
  partner: PartnerView;
  slot: InterviewSlot;
}

export interface PartnerStatus {
  partner: PartnerView;
  slot?: InterviewSlot;
}
