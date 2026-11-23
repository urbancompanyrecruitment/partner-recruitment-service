import type { FastifyReply, FastifyRequest } from 'fastify';
import { ActorRole, clearSession, requireSession } from '../../common/auth/index.js';
import { pool } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { BLOCKED_STATUS_ERROR } from './constant.js';
import { RecruiterStatus } from './interface.js';
import { findRecruiterById } from './repository.js';

export const requireRecruiterAccount = async (request: FastifyRequest, reply: FastifyReply): Promise<RecruiterStatus> => {
  const actor = await requireSession(request, ActorRole.Recruiter);
  const recruiter = await findRecruiterById(pool, actor.id);
  const blocked = recruiter ? BLOCKED_STATUS_ERROR[recruiter.status] : ErrorCode.Unauthorized;

  if (!recruiter || blocked) {
    clearSession(reply, ActorRole.Recruiter);

    throw new AppError(blocked ?? ErrorCode.Unauthorized);
  }

  request.actor = { ...actor, name: recruiter.full_name, email: recruiter.email };

  return recruiter.status;
};

export const requireRecruiter = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const status = await requireRecruiterAccount(request, reply);

  if (status !== RecruiterStatus.Active) throw new AppError(ErrorCode.RecruiterPendingApproval);
};
