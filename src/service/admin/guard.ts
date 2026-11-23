import type { FastifyReply, FastifyRequest } from 'fastify';
import { ActorRole, clearSession, requireSession } from '../../common/auth/index.js';
import { pool } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { AdminRole, AdminStatus } from './interface.js';
import { findAdminById } from './repository.js';

export const requireAdmin = async (request: FastifyRequest, reply: FastifyReply): Promise<AdminRole> => {
  const actor = await requireSession(request, ActorRole.Admin);
  const admin = await findAdminById(pool, actor.id);

  if (!admin || admin.status !== AdminStatus.Active) {
    clearSession(reply, ActorRole.Admin);

    throw new AppError(admin ? ErrorCode.AdminSuspended : ErrorCode.Unauthorized);
  }

  request.actor = { ...actor, name: admin.full_name, email: admin.email };

  return admin.role;
};

export const requireSuperAdmin = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  const role = await requireAdmin(request, reply);

  if (role !== AdminRole.SuperAdmin) throw new AppError(ErrorCode.Forbidden);
};
