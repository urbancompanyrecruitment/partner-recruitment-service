import type { FastifyInstance } from 'fastify';
import { ActorRole, clearSession, issueSession } from '../../common/auth/index.js';
import { HTTP_STATUS } from '../../common/errors/constant.js';
import { RECRUITER_LOGIN_RATE_LIMIT } from './constant.js';
import { requireRecruiter } from './guard.js';
import { recruiterLoginSchema } from './schema.js';
import { loginRecruiter, requireRecruiterRow, toRecruiterView } from './usecases.js';

export const recruiterRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post('/recruiter/auth/login', { config: { rateLimit: RECRUITER_LOGIN_RATE_LIMIT } }, async (request, reply) => {
    const recruiter = await loginRecruiter(recruiterLoginSchema.parse(request.body), request.id);

    await issueSession(reply, { id: recruiter.id, role: ActorRole.Recruiter, name: recruiter.name, email: recruiter.email });

    return recruiter;
  });

  app.post('/recruiter/auth/logout', async (_request, reply) => {
    clearSession(reply, ActorRole.Recruiter);

    return reply.code(HTTP_STATUS.noContent).send();
  });

  app.get('/recruiter/auth/me', { preHandler: requireRecruiter }, async request =>
    toRecruiterView(await requireRecruiterRow(request.actor.id)),
  );
};
