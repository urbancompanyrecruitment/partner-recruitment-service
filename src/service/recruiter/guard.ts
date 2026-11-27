import type { FastifyReply, FastifyRequest } from 'fastify';
import { ActorRole, clearSession, isSessionRevoked, requireSession } from '../../common/auth/index.js';
import { pool } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { BLOCKED_STATUS_ERROR, INACTIVE_STATUS_ERROR } from './constant.js';
import { RecruiterStatus } from './interface.js';
import { findRecruiterById } from './repository.js';

export const requireRecruiterAccount = async (request: FastifyRequest, reply: FastifyReply): Promise<RecruiterStatus> => {
  const actor = await requireSession(request, ActorRole.Recruiter);
  const recruiter = await findRecruiterById(pool, actor.id);

  if (!recruiter || isSessionRevoked(actor, recruiter.session_version)) {
    clearSession(reply, ActorRole.Recruiter);

    throw new AppError(ErrorCode.Unauthorized);
  }

  const blocked = BLOCKED_STATUS_ERROR[recruiter.status];

  if (blocked) {
    clearSession(reply, ActorRole.Recruiter);

    throw new AppError(blocked);
  }

  request.actor = { ...actor, name: recruiter.full_name, email: recruiter.email };

  return recruiter.status;
};

export const requireRecruiter = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const status = await requireRecruiterAccount(request, reply);

  if (status !== RecruiterStatus.Active) throw new AppError(INACTIVE_STATUS_ERROR[status] ?? ErrorCode.RecruiterNotActive);
};
