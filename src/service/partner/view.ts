import { decryptOptionalPhone, decryptPhone } from '../../common/crypto/phone.js';
import { toIsoDateTime, toOptionalIsoDateTime } from '../../common/time.js';
import { slotIdOf } from '../interview/index.js';
import { PARTNER_STAGE_BY_STATE } from './constant.js';
import { PartnerState, type PartnerRow, type PartnerView } from './interface.js';

export const toPartnerView = (row: PartnerRow, withPhones: boolean): PartnerView => ({
  id: row.id,
  name: row.full_name,
  primaryPhone: withPhones ? decryptPhone(row.primary_phone_enc) : undefined,
  singaporePhone: withPhones ? decryptOptionalPhone(row.singapore_phone_enc) : undefined,
  hasSingaporePhone: Boolean(row.singapore_phone_enc),
  country: row.current_country,
  city: row.current_city,
  nationality: row.nationality,
  age: row.age,
  source: row.source,
  referrer: row.referrer_name ?? undefined,
  comfortableWithDogs: Boolean(row.comfortable_with_dogs),
  deepCleaningExperience: Boolean(row.deep_cleaning_experience),
  cookingFrequency: row.cooking_frequency,
  interviewCity: row.interview_city_key,
  slotId: row.booking_city_key && row.booking_starts_at ? slotIdOf(row.booking_city_key, row.booking_starts_at) : undefined,
  state: row.state,
  stage: PARTNER_STAGE_BY_STATE[row.state],
  verified: row.state !== PartnerState.SignedUp,
  verifiedAt: toOptionalIsoDateTime(row.verified_at),
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
