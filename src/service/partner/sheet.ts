import { appendSheetRow, isSheetConfigured } from '../../common/clients/sheet.js';
import { decryptOptionalPii, decryptPii } from '../../common/crypto/pii.js';
import { pool } from '../../common/db/index.js';
import { logger } from '../../common/logger.js';
import { dayjs } from '../../common/time.js';
import { findPartnerSlot, getCity } from '../interview/index.js';
import { SHEET_HEADERS, SHEET_NO, SHEET_TIME_FORMAT, SHEET_TIME_ZONE, SHEET_YES } from './constant.js';
import { findPartnerById, listSheetPendingPartnerIds, updateSheetSynced } from './repository.js';

export const syncPartnerToSheet = async (partnerId: string): Promise<boolean> => {
  if (!isSheetConfigured()) return false;

  const partner = await findPartnerById(pool, partnerId);

  if (!partner || partner.sheet_synced_at) return false;

  const slot = await findPartnerSlot(pool, partnerId);
  const city = await getCity(partner.interview_city_key);
  const appended = await appendSheetRow(SHEET_HEADERS, [
    dayjs.utc(partner.created_at).tz(SHEET_TIME_ZONE).format(SHEET_TIME_FORMAT),
    partner.id,
    partner.full_name,
    decryptPii(partner.primary_phone_enc),
    decryptOptionalPii(partner.singapore_phone_enc) ?? '',
    partner.current_country,
    partner.current_city,
    partner.nationality,
    String(partner.age),
    partner.source,
    partner.referrer_name ?? '',
    partner.comfortable_with_dogs ? SHEET_YES : SHEET_NO,
    partner.deep_cleaning_experience ? SHEET_YES : SHEET_NO,
    partner.cooking_frequency,
    city?.country ?? '',
    city?.name ?? partner.interview_city_key,
    city?.centre ?? '',
    slot ? `${slot.date} ${slot.time} (${slot.timeZone})` : '',
    partner.registered_by_name ? `${partner.registered_by_name} (${partner.registered_by_company ?? ''})` : '',
  ]);

  if (!appended) return false;

  await updateSheetSynced(pool, partnerId);

  logger.info({ method: 'syncPartnerToSheet', partnerId, key_1: 'synced', key_1_value: String(appended) });

  return true;
};

export const syncPendingPartnersToSheet = async (): Promise<number> => {
  const partnerIds = await listSheetPendingPartnerIds(pool);
  const results = await partnerIds.reduce<Promise<boolean[]>>(
    (chain, partnerId) => chain.then(async done => [...done, await syncPartnerToSheet(partnerId)]),
    Promise.resolve([]),
  );

  return results.filter(Boolean).length;
};
