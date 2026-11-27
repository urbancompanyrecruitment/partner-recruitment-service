import { PartnerStage, PartnerState, RecruitmentSource } from './interface.js';

export const MIN_PARTNER_AGE = 18;

export const MAX_PARTNER_AGE = 80;

export const NAME_MAX_LENGTH = 120;

export const NAME_PART_MAX_LENGTH = 59;

export const WHITESPACE_RUN = /\s+/g;

export const NAME_SEPARATOR = ' ';

export const COUNTRY_MAX_LENGTH = 64;

export const CONSENT_VERSION = '2026-11-26';

export const SOURCES_REQUIRING_REFERRER: RecruitmentSource[] = [
  RecruitmentSource.Recruiter,
  RecruitmentSource.Referral,
  RecruitmentSource.Aggregator,
];

export const PARTNER_TRANSITIONS: Record<PartnerState, PartnerState[]> = {
  [PartnerState.SignedUp]: [PartnerState.Verified, PartnerState.VerificationFailed],
  [PartnerState.Verified]: [PartnerState.Placed],
  [PartnerState.VerificationFailed]: [],
  [PartnerState.Placed]: [PartnerState.Joined],
  [PartnerState.Joined]: [],
};

export const PARTNER_STAGE_BY_STATE: Record<PartnerState, PartnerStage> = {
  [PartnerState.SignedUp]: PartnerStage.Registered,
  [PartnerState.Verified]: PartnerStage.Verified,
  [PartnerState.VerificationFailed]: PartnerStage.VerificationFailed,
  [PartnerState.Placed]: PartnerStage.Placed,
  [PartnerState.Joined]: PartnerStage.Joined,
};

export const VERIFIED_STATES: PartnerState[] = [PartnerState.Verified, PartnerState.Placed, PartnerState.Joined];

export const TRANSITION_REASON = {
  verifiedUpload: 'verified_upload',
  verificationFailedUpload: 'verification_failed_upload',
  placementSaved: 'placement_saved',
  markedJoined: 'marked_joined',
};

export const HUB_NAME_MAX_LENGTH = 120;

export const SHEET_TIME_FORMAT = 'YYYY-MM-DD HH:mm';

export const SHEET_TIME_ZONE = 'Asia/Singapore';

export const SHEET_HEADERS = [
  'Registered at (SGT)',
  'Candidate ID',
  'Name',
  'Primary mobile',
  'Singapore mobile',
  'Current country',
  'Current city',
  'Nationality',
  'Age',
  'Source',
  'Referrer',
  'Comfortable with dogs',
  'Deep-cleaning experience',
  'Cooking frequency',
  'Interview country',
  'Interview city',
  'Interview centre',
  'Interview slot',
  'Registered by recruiter',
];

export const SHEET_YES = 'Yes';

export const SHEET_NO = 'No';

export const PARTNER_SELECT = `
  SELECT p.*, b.city_key AS booking_city_key, b.starts_at AS booking_starts_at,
         rr.full_name AS registered_by_name, rr.company AS registered_by_company
  FROM partners p
  LEFT JOIN slot_bookings b ON b.partner_id = p.id
  LEFT JOIN recruiters rr ON rr.id = p.registered_by_recruiter_id`;

export const SEARCH_WILDCARD = '%';

export const SIGN_UP_RATE_LIMIT = { max: 5, timeWindow: '10 minutes' };

export const LOGIN_RATE_LIMIT = { max: 10, timeWindow: '10 minutes' };

export const LEAD_ID_PREFIX = 'lead-';

export const JOURNEY_ID_PREFIX = 'journey-';

export const LEAD_ID_SUFFIX_LENGTH = 8;
