import { CookingFrequency, PartnerState, RecruitmentSource } from '../service/partner/interface.js';
import { InactiveReason, LockState } from '../service/lock/interface.js';

export const DEMO_PASSWORD = 'Demo123!';

export const seedId = (prefix: number, index: number): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`;

export const RECRUITER_PREFIX = 10;

export const PARTNER_PREFIX = 20;

export const LOCK_PREFIX = 30;

export const SEED_RECRUITERS = [
  { id: seedId(RECRUITER_PREFIX, 1), email: 'alex.morgan@brightpath.sg', name: 'Alex Morgan', company: 'BrightPath Recruitment' },
  { id: seedId(RECRUITER_PREFIX, 2), email: 'jamie.lee@horizon.sg', name: 'Jamie Lee', company: 'Horizon Recruitment' },
];

export interface SeedPartner {
  index: number;
  name: string;
  primaryPhone: string;
  singaporePhone?: string;
  country: string;
  city: string;
  nationality: string;
  age: number;
  source: RecruitmentSource;
  referrer?: string;
  cookingFrequency: CookingFrequency;
  interviewCity: string;
  slotDayOffset: number;
  slotHour: number;
  state: PartnerState;
  hasLead: boolean;
  approved: boolean;
  createdDaysAgo: number;
}

const partner = (
  index: number,
  name: string,
  primaryPhone: string,
  singaporePhone: string | undefined,
  location: [string, string, string],
  age: number,
  source: RecruitmentSource,
  interviewCity: string,
  slotDayOffset: number,
  slotHour: number,
  state: PartnerState,
  createdDaysAgo: number,
  referrer?: string,
): SeedPartner => ({
  index,
  name,
  primaryPhone,
  singaporePhone,
  country: location[0],
  city: location[1],
  nationality: location[2],
  age,
  source,
  referrer,
  cookingFrequency: CookingFrequency.Frequently,
  interviewCity,
  slotDayOffset,
  slotHour,
  state,
  hasLead: Boolean(singaporePhone),
  approved: Boolean(singaporePhone) && state !== PartnerState.SignedUp,
  createdDaysAgo,
});

export const SEED_PARTNERS: SeedPartner[] = [
  partner(1, 'Thandar Aung', '+6590000001', '+6590000001', ['Singapore', 'Singapore', 'Myanmar'], 31, RecruitmentSource.TikTok, 'tampines', -2, 9, PartnerState.Verified, 9),
  partner(2, 'May Thu', '+9590000002', '+6580000002', ['Myanmar', 'Yangon', 'Myanmar'], 28, RecruitmentSource.Referral, 'jurong-east', -4, 10, PartnerState.Placed, 12, 'Thandar Aung'),
  partner(3, 'Siti Rahma', '+6690000003', '+6580000003', ['Thailand', 'Bangkok', 'Indonesia'], 35, RecruitmentSource.Recruiter, 'woodlands', -6, 11, PartnerState.Verified, 15, 'BrightPath Recruitment'),
  partner(4, 'Hnin Wai', '+9590000004', '+6580000004', ['Myanmar', 'Mandalay', 'Myanmar'], 26, RecruitmentSource.Direct, 'jurong-east', -4, 10, PartnerState.Verified, 6),
  partner(5, 'Ana Reyes', '+6590000005', '+6590000005', ['Singapore', 'Singapore', 'Philippines'], 39, RecruitmentSource.TikTok, 'tampines', -2, 9, PartnerState.Placed, 5),
  partner(6, 'Nwe Nwe Yi', '+6590000006', '+6590000006', ['Singapore', 'Singapore', 'Myanmar'], 42, RecruitmentSource.Aggregator, 'tampines', -2, 9, PartnerState.Verified, 4, 'HomeCare Collective'),
  partner(7, 'Aye Chan', '+9590000007', '+6580000007', ['Myanmar', 'Yangon', 'Myanmar'], 30, RecruitmentSource.Facebook, 'bedok', -3, 14, PartnerState.Verified, 3),
  partner(8, 'Mira Santos', '+6690000008', undefined, ['Thailand', 'Bangkok', 'Philippines'], 24, RecruitmentSource.TikTok, 'woodlands', 2, 11, PartnerState.SignedUp, 2),
  partner(9, 'Khin Myo', '+9590000009', undefined, ['Myanmar', 'Yangon', 'Myanmar'], 33, RecruitmentSource.TikTok, 'jurong-east', -4, 10, PartnerState.SignedUp, 5),
  partner(10, 'Rosa Dela Cruz', '+6390000010', undefined, ['Philippines', 'Manila', 'Philippines'], 29, RecruitmentSource.Facebook, 'woodlands', 2, 11, PartnerState.SignedUp, 1),
  partner(11, 'Zar Ni', '+6590000011', '+6590000011', ['Singapore', 'Singapore', 'Myanmar'], 27, RecruitmentSource.Referral, 'tampines', -2, 9, PartnerState.SignedUp, 4, 'Nwe Nwe Yi'),
  partner(12, 'Lin Lin Htet', '+6590000012', '+6590000012', ['Singapore', 'Singapore', 'Myanmar'], 25, RecruitmentSource.TikTok, 'tampines', 1, 9, PartnerState.SignedUp, 0),
  partner(13, 'Dewi Lestari', '+6290000013', undefined, ['Indonesia', 'Jakarta', 'Indonesia'], 36, RecruitmentSource.Recruiter, 'woodlands', 2, 11, PartnerState.SignedUp, 3, 'Horizon Recruitment'),
  partner(14, 'Su Su Hlaing', '+9590000014', undefined, ['Myanmar', 'Yangon', 'Myanmar'], 23, RecruitmentSource.Influencer, 'ang-mo-kio', 1, 10, PartnerState.SignedUp, 2),
  partner(15, 'Maria Lopez', '+6590000015', '+6590000015', ['Singapore', 'Singapore', 'Philippines'], 45, RecruitmentSource.Direct, 'bedok', 1, 10, PartnerState.SignedUp, 1),
];

export interface SeedLock {
  index: number;
  partnerIndex: number;
  recruiterIndex: number;
  lockedHoursAgo: number;
  releaseInHours: number;
  state: LockState;
  inactiveReason?: InactiveReason;
  employerName?: string;
  startInDays?: number;
}

export const SEED_LOCKS: SeedLock[] = [
  { index: 1, partnerIndex: 5, recruiterIndex: 1, lockedHoursAgo: 24, releaseInHours: 24, state: LockState.Inactive, inactiveReason: InactiveReason.Placed, employerName: 'HomeCare Collective', startInDays: 10 },
  { index: 2, partnerIndex: 2, recruiterIndex: 1, lockedHoursAgo: 30, releaseInHours: 18, state: LockState.Inactive, inactiveReason: InactiveReason.Placed, employerName: 'CleanSpace Services', startInDays: 30 },
  { index: 3, partnerIndex: 6, recruiterIndex: 1, lockedHoursAgo: 46, releaseInHours: 2, state: LockState.Active },
  { index: 4, partnerIndex: 7, recruiterIndex: 2, lockedHoursAgo: 1, releaseInHours: 47, state: LockState.Active },
  { index: 5, partnerIndex: 4, recruiterIndex: 2, lockedHoursAgo: 120, releaseInHours: -72, state: LockState.Inactive, inactiveReason: InactiveReason.Expired },
];
