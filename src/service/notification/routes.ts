import type { FastifyInstance } from 'fastify';
import { ActorRole, requireSession } from '../../common/auth/index.js';
import { HTTP_STATUS } from '../../common/errors/constant.js';
import { listPartnerNotifications, markPartnerNotificationsRead } from './usecases.js';

export const notificationRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/partner/notifications', async request => {
    const actor = await requireSession(request, ActorRole.Partner);

    return listPartnerNotifications(actor.id);
  });

  app.post('/partner/notifications/read', async (request, reply) => {
    const actor = await requireSession(request, ActorRole.Partner);

    await markPartnerNotificationsRead(actor.id);

    return reply.code(HTTP_STATUS.noContent).send();
  });
};
