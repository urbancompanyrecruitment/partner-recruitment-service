import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HTTP_STATUS } from '../../common/errors/constant.js';
import { listAggregators } from '../aggregator/index.js';
import { listRegisteredPartners, recruiterPartnerSchema, RecruitmentSource, signUp } from '../partner/index.js';
import { requireRecruiter } from '../recruiter/index.js';
import { placementSchema } from './schema.js';
import { getLockedPartner, listAvailablePartners, listMyLocks, lockPartner, recordPlacement, releaseLock } from './usecases.js';

const availableQuerySchema = z.object({ country: z.string().trim().optional() });

const partnerParamsSchema = z.object({ partnerId: z.string().uuid() });

export const lockRoutes = async (app: FastifyInstance): Promise<void> => {
  app.addHook('preHandler', requireRecruiter);

  app.get('/recruiter/partners/available', async request => listAvailablePartners(availableQuerySchema.parse(request.query)));

  app.get('/recruiter/partners/registered', async request => listRegisteredPartners(request.actor.id));

  app.post('/recruiter/partners', async (request, reply) => {
    const details = recruiterPartnerSchema.parse(request.body);
    const result = await signUp({ ...details, source: RecruitmentSource.Recruiter, referrer: request.actor.name }, request.actor, request.id);

    return reply.code(HTTP_STATUS.created).send(result);
  });

  app.get('/recruiter/aggregators', async request => listAggregators(request.actor.id));

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

    return recordPlacement(partnerId, request.actor, placementSchema.parse(request.body), request.id);
  });

  app.post('/recruiter/partners/:partnerId/release', async request => {
    const { partnerId } = partnerParamsSchema.parse(request.params);

    return releaseLock(partnerId, request.actor, request.id);
  });
};
