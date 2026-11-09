import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRecruiter } from '../recruiter/index.js';
import { placementSchema } from './schema.js';
import { getLockedPartner, listAvailablePartners, listMyLocks, lockPartner, recordPlacement, releaseLock } from './usecases.js';

const availableQuerySchema = z.object({ country: z.string().trim().optional() });

const partnerParamsSchema = z.object({ partnerId: z.string().uuid() });

export const lockRoutes = async (app: FastifyInstance): Promise<void> => {
  app.addHook('preHandler', requireRecruiter);

  app.get('/recruiter/partners/available', async request => listAvailablePartners(availableQuerySchema.parse(request.query)));

  app.get('/recruiter/locks', async request => listMyLocks(request.actor.id));

  app.post('/recruiter/partners/:partnerId/lock', async request => {
    const { partnerId } = partnerParamsSchema.parse(request.params);

    return lockPartner(partnerId, request.actor.id, request.id);
  });

  app.get('/recruiter/partners/:partnerId', async request => {
    const { partnerId } = partnerParamsSchema.parse(request.params);

    return getLockedPartner(partnerId, request.actor.id, request.id);
  });

  app.post('/recruiter/partners/:partnerId/placement', async request => {
    const { partnerId } = partnerParamsSchema.parse(request.params);

    return recordPlacement(partnerId, request.actor.id, placementSchema.parse(request.body), request.id);
  });

  app.post('/recruiter/partners/:partnerId/release', async request => {
    const { partnerId } = partnerParamsSchema.parse(request.params);

    return releaseLock(partnerId, request.actor.id, request.id);
  });
};
