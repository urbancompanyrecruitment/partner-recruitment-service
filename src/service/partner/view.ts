import { decryptOptionalPii, decryptPii } from '../../common/crypto/pii.js';
import { toIsoDateTime, toOptionalIsoDateTime } from '../../common/time.js';
import { slotIdOf } from '../interview/index.js';
import { PARTNER_STAGE_BY_STATE, VERIFIED_STATES } from './constant.js';
import type { PartnerRow, PartnerView } from './interface.js';

export const toPartnerView = (row: PartnerRow, withContactDetails: boolean): PartnerView => ({
  id: row.id,
  name: row.full_name,
  primaryPhone: withContactDetails ? decryptPii(row.primary_phone_enc) : undefined,
  singaporePhone: withContactDetails ? decryptOptionalPii(row.singapore_phone_enc) : undefined,
  hasSingaporePhone: Boolean(row.singapore_phone_enc),
  country: row.current_country,
  city: row.current_city,
  nationality: row.nationality,
  age: row.age,
  source: row.source,
  referrer: row.referrer_name ?? undefined,
  registeredBy:
    row.registered_by_recruiter_id && row.registered_by_name
      ? { recruiterId: row.registered_by_recruiter_id, name: row.registered_by_name, company: row.registered_by_company ?? '' }
      : undefined,
  comfortableWithDogs: Boolean(row.comfortable_with_dogs),
  deepCleaningExperience: Boolean(row.deep_cleaning_experience),
  cookingFrequency: row.cooking_frequency,
  interviewCity: row.interview_city_key,
  slotId: row.booking_city_key && row.booking_starts_at ? slotIdOf(row.booking_city_key, row.booking_starts_at) : undefined,
  state: row.state,
  stage: PARTNER_STAGE_BY_STATE[row.state],
  verified: VERIFIED_STATES.includes(row.state),
  verifiedAt: toOptionalIsoDateTime(row.verified_at),
  hubName: row.hub_name ?? undefined,
  onboarding: row.lead_id
    ? {
        leadId: row.lead_id,
        journeyId: row.onboarding_journey_id ?? undefined,
        leadCreatedAt: toIsoDateTime(row.lead_created_at ?? row.created_at),
        approvedAt: toOptionalIsoDateTime(row.approved_at),
      }
    : undefined,
  createdAt: toIsoDateTime(row.created_at),
});
