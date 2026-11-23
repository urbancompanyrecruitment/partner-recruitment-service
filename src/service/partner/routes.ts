import type { FastifyInstance } from 'fastify';
import { ActorRole, clearSession, issueSession, requireSession } from '../../common/auth/index.js';
import { pool } from '../../common/db/index.js';
import { HTTP_STATUS } from '../../common/errors/constant.js';
import { LOGIN_RATE_LIMIT, SIGN_UP_RATE_LIMIT } from './constant.js';
import { loginSchema, rescheduleSchema, signUpSchema } from './schema.js';
import { getPartnerStatus, login, requirePartnerRow, reschedule, signUp } from './usecases.js';
import { toPartnerView } from './view.js';

export const partnerRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post('/partner/sign-up', { config: { rateLimit: SIGN_UP_RATE_LIMIT } }, async (request, reply) => {
    const result = await signUp(signUpSchema.parse(request.body), undefined, request.id);

    return reply.code(HTTP_STATUS.created).send(result);
  });

  app.post('/partner/auth/login', { config: { rateLimit: LOGIN_RATE_LIMIT } }, async (request, reply) => {
    const partner = await login(loginSchema.parse(request.body), request.id);

    await issueSession(reply, { id: partner.id, role: ActorRole.Partner, name: partner.name });

    return partner;
  });

  app.post('/partner/auth/logout', async (_request, reply) => {
    clearSession(reply, ActorRole.Partner);

    return reply.code(HTTP_STATUS.noContent).send();
  });

  app.get('/partner/auth/me', async request => {
    const actor = await requireSession(request, ActorRole.Partner);

    return toPartnerView(await requirePartnerRow(pool, actor.id), true);
  });

  app.get('/partner/me', async request => {
    const actor = await requireSession(request, ActorRole.Partner);

    return getPartnerStatus(actor.id);
  });

  app.post('/partner/reschedule', async request => {
    const actor = await requireSession(request, ActorRole.Partner);

    return reschedule(actor.id, rescheduleSchema.parse(request.body), request.id);
  });
};
