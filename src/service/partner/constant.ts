import { PartnerStage, PartnerState, RecruitmentSource } from './interface.js';

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_MAX_LENGTH = 128;

export const MIN_PARTNER_AGE = 18;

export const MAX_PARTNER_AGE = 80;

export const NAME_MAX_LENGTH = 120;

export const COUNTRY_MAX_LENGTH = 64;

export const CONSENT_VERSION = '2026-11';

export const SOURCES_REQUIRING_REFERRER: RecruitmentSource[] = [
  RecruitmentSource.Recruiter,
  RecruitmentSource.Referral,
  RecruitmentSource.Aggregator,
];

export const PARTNER_TRANSITIONS: Record<PartnerState, PartnerState[]> = {
  [PartnerState.SignedUp]: [PartnerState.Verified],
  [PartnerState.Verified]: [PartnerState.Placed],
  [PartnerState.Placed]: [PartnerState.Joined],
  [PartnerState.Joined]: [],
};

export const PARTNER_STAGE_BY_STATE: Record<PartnerState, PartnerStage> = {
  [PartnerState.SignedUp]: PartnerStage.Registered,
  [PartnerState.Verified]: PartnerStage.Verified,
  [PartnerState.Placed]: PartnerStage.Placed,
  [PartnerState.Joined]: PartnerStage.Joined,
};

export const TRANSITION_REASON = {
  verifiedUpload: 'verified_upload',
  placementSaved: 'placement_saved',
  markedJoined: 'marked_joined',
};

export const PARTNER_SELECT = `
  SELECT p.*, b.city_key AS booking_city_key, b.starts_at AS booking_starts_at
  FROM partners p
  LEFT JOIN slot_bookings b ON b.partner_id = p.id`;

export const SEARCH_WILDCARD = '%';

export const SIGN_UP_RATE_LIMIT = { max: 5, timeWindow: '10 minutes' };

export const LOGIN_RATE_LIMIT = { max: 10, timeWindow: '10 minutes' };
