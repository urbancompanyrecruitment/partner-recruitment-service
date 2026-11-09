import type { FastifyReply, FastifyRequest } from 'fastify';
import { ActorRole, clearSession, requireSession } from '../../common/auth/index.js';
import { pool } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { RecruiterStatus } from './interface.js';
import { findRecruiterById } from './repository.js';

export const requireRecruiter = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const actor = await requireSession(request, ActorRole.Recruiter);
  const recruiter = await findRecruiterById(pool, actor.id);

  if (!recruiter || recruiter.status !== RecruiterStatus.Active) {
    clearSession(reply, ActorRole.Recruiter);

    throw new AppError(recruiter ? ErrorCode.RecruiterSuspended : ErrorCode.Unauthorized);
  }

  request.actor = { ...actor, name: recruiter.full_name, email: recruiter.email };
};
