import type { FastifyRequest } from 'fastify';
import { ActorRole, requireSession } from '../../common/auth/index.js';

export const requireAdmin = async (request: FastifyRequest): Promise<void> => {
  request.actor = await requireSession(request, ActorRole.Admin);
};
