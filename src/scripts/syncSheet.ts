import { isSheetConfigured } from '../common/clients/sheet.js';
import { pool } from '../common/db/index.js';
import { logger } from '../common/logger.js';
import { syncPendingPartnersToSheet } from '../service/partner/index.js';

const run = async (): Promise<number> => {
  if (!isSheetConfigured()) throw new Error('SIGNUP_SHEET_WEBHOOK_URL is not set');

  return syncPendingPartnersToSheet();
};

run()
  .then(async synced => {
    logger.info({ method: 'syncSheetCli', key_1: 'synced', key_1_value: String(synced) });

    await pool.end();

    process.exit(0);
  })
  .catch(async (error: Error) => {
    logger.error({ method: 'syncSheetCli', message: 'Sheet sync failed', error: error?.message || error?.stack });

    await pool.end();

    process.exit(1);
  });
