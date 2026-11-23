import type { FastifyInstance } from 'fastify';
import { ActorRole, changePasswordSchema, clearSession, issueSession } from '../../common/auth/index.js';
import { pool } from '../../common/db/index.js';
import { HTTP_STATUS } from '../../common/errors/constant.js';
import { RECRUITER_LOGIN_RATE_LIMIT, RECRUITER_SIGN_UP_RATE_LIMIT } from './constant.js';
import { requireRecruiterAccount } from './guard.js';
import { recruiterLoginSchema, recruiterSignUpSchema } from './schema.js';
import { changeRecruiterPassword, loginRecruiter, requireRecruiterRow, signUpRecruiter, toRecruiterView } from './usecases.js';

export const recruiterRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post('/recruiter/sign-up', { config: { rateLimit: RECRUITER_SIGN_UP_RATE_LIMIT } }, async (request, reply) => {
    const recruiter = await signUpRecruiter(recruiterSignUpSchema.parse(request.body), request.id);

    await issueSession(reply, { id: recruiter.id, role: ActorRole.Recruiter, name: recruiter.name, email: recruiter.email });

    return reply.code(HTTP_STATUS.created).send(recruiter);
  });

  app.post('/recruiter/auth/login', { config: { rateLimit: RECRUITER_LOGIN_RATE_LIMIT } }, async (request, reply) => {
    const recruiter = await loginRecruiter(recruiterLoginSchema.parse(request.body), request.id);

    await issueSession(reply, { id: recruiter.id, role: ActorRole.Recruiter, name: recruiter.name, email: recruiter.email });

    return recruiter;
  });

  app.post('/recruiter/auth/logout', async (_request, reply) => {
    clearSession(reply, ActorRole.Recruiter);

    return reply.code(HTTP_STATUS.noContent).send();
  });

  app.get('/recruiter/auth/me', async (request, reply) => {
    await requireRecruiterAccount(request, reply);

    return toRecruiterView(await requireRecruiterRow(pool, request.actor.id));
  });

  app.post('/recruiter/change-password', async (request, reply) => {
    await requireRecruiterAccount(request, reply);

    await changeRecruiterPassword(request.actor.id, changePasswordSchema.parse(request.body), request.id);

    return reply.code(HTTP_STATUS.noContent).send();
  });
};
