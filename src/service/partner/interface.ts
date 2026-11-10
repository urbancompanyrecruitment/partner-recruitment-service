import type { RowDataPacket } from 'mysql2/promise';
import type { z } from 'zod';
import type { ActorType } from '../audit/interface.js';
import type { InterviewSlot } from '../interview/interface.js';
import type { changePasswordSchema, loginSchema, signUpSchema } from './schema.js';

export enum PartnerState {
  SignedUp = 'signed_up',
  Verified = 'verified',
  Placed = 'placed',
  Joined = 'joined',
}

export enum PartnerStage {
  Registered = 'registered',
  Verified = 'verified',
  Placed = 'placed',
  Joined = 'joined',
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

export type LoginInput = z.infer<typeof loginSchema>;

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export interface PartnerRow extends RowDataPacket {
  id: string;
  primary_phone_enc: Buffer;
  primary_phone_checksum: string;
  singapore_phone_enc: Buffer | null;
  email_enc: Buffer | null;
  email_checksum: string | null;
  password_hash: string;
  failed_login_count: number;
  login_locked_until: string | null;
  last_login_at: string | null;
  full_name: string;
  current_country: string;
  current_city: string;
  nationality: string;
  age: number;
  source: RecruitmentSource;
  referrer_name: string | null;
  comfortable_with_dogs: number;
  deep_cleaning_experience: number;
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
  created_at: string;
  updated_at: string;
  booking_city_key: string | null;
  booking_starts_at: string | null;
}

export interface PartnerIdRow extends RowDataPacket {
  id: string;
}

export interface PartnerOnboarding {
  leadId: string;
  journeyId?: string;
  leadCreatedAt: string;
  approvedAt?: string;
}

export interface PartnerView {
  id: string;
  name: string;
  email?: string;
  primaryPhone?: string;
  singaporePhone?: string;
  hasSingaporePhone: boolean;
  country: string;
  city: string;
  nationality: string;
  age: number;
  source: RecruitmentSource;
  referrer?: string;
  comfortableWithDogs: boolean;
  deepCleaningExperience: boolean;
  cookingFrequency: CookingFrequency;
  interviewCity: string;
  slotId?: string;
  state: PartnerState;
  stage: PartnerStage;
  verified: boolean;
  verifiedAt?: string;
  onboarding?: PartnerOnboarding;
  createdAt: string;
}

export interface NewPartner {
  id: string;
  email: string;
  primaryPhone: string;
  singaporePhone?: string;
  passwordHash: string;
  name: string;
  country: string;
  city: string;
  nationality: string;
  age: number;
  source: RecruitmentSource;
  referrer?: string;
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
