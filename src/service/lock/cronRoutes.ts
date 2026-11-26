import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../../common/config/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { BEARER_PREFIX, CRON_PATH } from './constant.js';
import { deactivateExpiredLocks } from './usecases.js';

export const lockCronRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get(CRON_PATH.deactivateExpiredLocks, async request => {
    const expected = Buffer.from(`${BEARER_PREFIX}${config.cronSecret ?? ''}`);
    const received = Buffer.from(request.headers.authorization ?? '');
    const authorised = Boolean(config.cronSecret) && received.length === expected.length && timingSafeEqual(received, expected);

    if (!authorised) {
      request.log.warn({ method: 'deactivateExpiredLocksCron', message: 'Cron request rejected' });

      throw new AppError(ErrorCode.Unauthorized);
    }

    return deactivateExpiredLocks();
  });
};
