import { AdminRole } from '../service/admin/index.js';
import { InactiveReason, LockOrigin, LockState } from '../service/lock/interface.js';
import { CookingFrequency, PartnerCountry, PartnerState, RecruitmentSource } from '../service/partner/interface.js';
import { RecruiterStatus } from '../service/recruiter/index.js';

export const DEMO_PASSWORD = 'Demo123!';

export const SEED_EMAIL_DOMAIN = 'example.com';

export const seedId = (prefix: number, index: number): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(index).padStart(12, '0')}`;

export const ADMIN_PREFIX = 5;

export const RECRUITER_PREFIX = 10;

export const PARTNER_PREFIX = 20;

export const LOCK_PREFIX = 30;

export const AGGREGATOR_PREFIX = 40;

export const NOTIFICATION_PREFIX = 50;

export const SEED_ADMINS = [
  { id: seedId(ADMIN_PREFIX, 1), email: `admin@${SEED_EMAIL_DOMAIN}`, name: 'Local Admin', role: AdminRole.SuperAdmin },
  { id: seedId(ADMIN_PREFIX, 2), email: `ops@${SEED_EMAIL_DOMAIN}`, name: 'Ops Admin', role: AdminRole.Admin },
];

export const SEED_RECRUITERS = [
  { id: seedId(RECRUITER_PREFIX, 1), email: 'alex.morgan@brightpath.sg', name: 'Alex Morgan', company: 'BrightPath Recruitment', status: RecruiterStatus.Active },
  { id: seedId(RECRUITER_PREFIX, 2), email: 'jamie.lee@horizon.sg', name: 'Jamie Lee', company: 'Horizon Recruitment', status: RecruiterStatus.Active },
  { id: seedId(RECRUITER_PREFIX, 3), email: 'priya.nair@swiftstaff.sg', name: 'Priya Nair', company: 'SwiftStaff Agency', status: RecruiterStatus.Pending },
];

export const SEED_AGGREGATORS = [
  { index: 1, recruiterIndex: 1, name: 'HomeCare Collective' },
  { index: 2, recruiterIndex: 1, name: 'CleanSpace Services' },
  { index: 3, recruiterIndex: 2, name: 'Horizon Staffing' },
];

export interface SeedPartner {
  index: number;
  name: string;
  primaryPhone: string;
  singaporePhone?: string;
  country: PartnerCountry;
  city: string;
  nationality: string;
  age: number;
  source: RecruitmentSource;
  referrer?: string;
  registeredByRecruiterIndex?: number;
  cookingFrequency: CookingFrequency;
  interviewCity: string;
  slotDayOffset: number;
  slotHour: number;
  state: PartnerState;
  hubName?: string;
  hasLead: boolean;
  approved: boolean;
  createdDaysAgo: number;
}

const APPROVED_STATES = [PartnerState.Verified, PartnerState.Placed, PartnerState.Joined];

const partner = (
  index: number,
  name: string,
  primaryPhone: string,
  singaporePhone: string | undefined,
  location: [PartnerCountry, string, string],
  age: number,
  source: RecruitmentSource,
  interviewCity: string,
  slotDayOffset: number,
  slotHour: number,
  state: PartnerState,
  createdDaysAgo: number,
  extra: Partial<Pick<SeedPartner, 'referrer' | 'hubName' | 'registeredByRecruiterIndex'>> = {},
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
  referrer: extra.referrer,
  registeredByRecruiterIndex: extra.registeredByRecruiterIndex,
  cookingFrequency: CookingFrequency.Frequently,
  interviewCity,
  slotDayOffset,
  slotHour,
  state,
  hubName: extra.hubName,
  hasLead: Boolean(singaporePhone),
  approved: Boolean(singaporePhone) && APPROVED_STATES.includes(state),
  createdDaysAgo,
});

const { Singapore, Myanmar, Others } = PartnerCountry;

export const SEED_PARTNERS: SeedPartner[] = [
  partner(1, 'Thandar Aung', '+6590000001', '+6590000001', [Singapore, 'Singapore', 'Myanmar'], 31, RecruitmentSource.TikTok, 'singapore', -2, 9, PartnerState.Verified, 9),
  partner(2, 'May Thu', '+9590000002', '+6580000002', [Myanmar, 'Yangon', 'Myanmar'], 28, RecruitmentSource.Referral, 'yangon', -4, 10, PartnerState.Placed, 12, { referrer: 'Thandar Aung', hubName: 'Jurong · West cluster' }),
  partner(3, 'Siti Rahma', '+6690000003', '+6580000003', [Others, 'Bangkok', 'Indonesia'], 35, RecruitmentSource.Recruiter, 'singapore', -6, 11, PartnerState.Verified, 15, { referrer: 'Alex Morgan', registeredByRecruiterIndex: 1 }),
  partner(4, 'Hnin Wai', '+9590000004', '+6580000004', [Myanmar, 'Mandalay', 'Myanmar'], 26, RecruitmentSource.Direct, 'yangon', -4, 10, PartnerState.Verified, 6),
  partner(5, 'Ana Reyes', '+6590000005', '+6590000005', [Singapore, 'Singapore', 'Philippines'], 39, RecruitmentSource.TikTok, 'singapore', -2, 9, PartnerState.Placed, 5, { hubName: 'Tampines · East cluster' }),
  partner(6, 'Nwe Nwe Yi', '+6590000006', '+6590000006', [Singapore, 'Singapore', 'Myanmar'], 42, RecruitmentSource.Aggregator, 'singapore', -2, 9, PartnerState.Verified, 4, { referrer: 'HomeCare Collective' }),
  partner(7, 'Aye Chan', '+9590000007', undefined, [Myanmar, 'Yangon', 'Myanmar'], 30, RecruitmentSource.Facebook, 'yangon', -3, 14, PartnerState.Verified, 3),
  partner(8, 'Mira Santos', '+6690000008', undefined, [Others, 'Bangkok', 'Philippines'], 24, RecruitmentSource.TikTok, 'singapore', 2, 11, PartnerState.SignedUp, 2),
  partner(9, 'Khin Myo', '+9590000009', undefined, [Myanmar, 'Yangon', 'Myanmar'], 33, RecruitmentSource.TikTok, 'yangon', -4, 10, PartnerState.VerificationFailed, 5),
  partner(10, 'Rosa Dela Cruz', '+6390000010', undefined, [Others, 'Manila', 'Philippines'], 29, RecruitmentSource.Facebook, 'singapore', 2, 11, PartnerState.SignedUp, 1),
  partner(11, 'Zar Ni', '+6590000011', '+6590000011', [Singapore, 'Singapore', 'Myanmar'], 27, RecruitmentSource.Referral, 'singapore', -2, 9, PartnerState.SignedUp, 4, { referrer: 'Nwe Nwe Yi' }),
  partner(12, 'Lin Lin Htet', '+6590000012', '+6590000012', [Singapore, 'Singapore', 'Myanmar'], 25, RecruitmentSource.TikTok, 'singapore', 1, 9, PartnerState.SignedUp, 0),
  partner(13, 'Dewi Lestari', '+6290000013', undefined, [Others, 'Jakarta', 'Indonesia'], 36, RecruitmentSource.Recruiter, 'singapore', 2, 11, PartnerState.SignedUp, 3, { referrer: 'Jamie Lee', registeredByRecruiterIndex: 2 }),
  partner(14, 'Su Su Hlaing', '+9590000014', undefined, [Myanmar, 'Mandalay', 'Myanmar'], 23, RecruitmentSource.Influencer, 'yangon', 1, 10, PartnerState.SignedUp, 2),
  partner(15, 'Maria Lopez', '+6590000015', '+6590000015', [Singapore, 'Singapore', 'Philippines'], 45, RecruitmentSource.Direct, 'singapore', 1, 10, PartnerState.SignedUp, 1),
];

export interface SeedLock {
  index: number;
  partnerIndex: number;
  recruiterIndex: number;
  origin: LockOrigin;
  lockedHoursAgo: number;
  releaseInHours?: number;
  state: LockState;
  inactiveReason?: InactiveReason;
  aggregatorIndex?: number;
  startInDays?: number;
}

export const SEED_LOCKS: SeedLock[] = [
  { index: 1, partnerIndex: 5, recruiterIndex: 1, origin: LockOrigin.Recruiter, lockedHoursAgo: 24, releaseInHours: 48, state: LockState.Inactive, inactiveReason: InactiveReason.Placed, aggregatorIndex: 1, startInDays: 10 },
  { index: 2, partnerIndex: 2, recruiterIndex: 1, origin: LockOrigin.Admin, lockedHoursAgo: 30, releaseInHours: 42, state: LockState.Inactive, inactiveReason: InactiveReason.Placed, aggregatorIndex: 2, startInDays: 30 },
  { index: 3, partnerIndex: 6, recruiterIndex: 1, origin: LockOrigin.Recruiter, lockedHoursAgo: 70, releaseInHours: 2, state: LockState.Active },
  { index: 4, partnerIndex: 7, recruiterIndex: 2, origin: LockOrigin.Recruiter, lockedHoursAgo: 1, releaseInHours: 71, state: LockState.Active },
  { index: 5, partnerIndex: 4, recruiterIndex: 2, origin: LockOrigin.Recruiter, lockedHoursAgo: 192, releaseInHours: -120, state: LockState.Inactive, inactiveReason: InactiveReason.Expired },
  { index: 6, partnerIndex: 3, recruiterIndex: 1, origin: LockOrigin.Registration, lockedHoursAgo: 200, state: LockState.Active },
];
