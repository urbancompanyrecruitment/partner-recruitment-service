import { pool } from '../common/db/index.js';
import { logger } from '../common/logger.js';
import { deactivateExpiredLocks } from '../service/lock/index.js';

deactivateExpiredLocks()
  .then(async result => {
    logger.info({ method: 'deactivateExpiredLocksWorkflow', key_1: 'deactivated', key_1_value: String(result.deactivated) });

    await pool.end();

    process.exit(0);
  })
  .catch(async (error: Error) => {
    logger.error({ method: 'deactivateExpiredLocksWorkflow', message: 'Workflow failed', error: error?.message || error?.stack });

    await pool.end();

    process.exit(1);
  });
