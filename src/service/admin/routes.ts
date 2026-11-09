import type { FastifyInstance, FastifyReply } from 'fastify';
import { ActorRole, clearSession, issueSession, requireSession } from '../../common/auth/index.js';
import { HTTP_STATUS } from '../../common/errors/constant.js';
import { getSlotOccupancy } from '../interview/index.js';
import { listAllLocks } from '../lock/index.js';
import { createRecruiter, createRecruiterSchema, listRecruiters, recruiterStatusSchema, setRecruiterStatus } from '../recruiter/index.js';
import { buildFailCsv, getImport, importParamsSchema, importSchema, importVerifiedPartners } from '../verification/index.js';
import { CSV_CONTENT_TYPE, EXPORT_FILE_NAME, FAIL_CSV_FILE_NAME } from './constant.js';
import { requireAdmin } from './guard.js';
import {
  googleLoginSchema,
  occupancyQuerySchema,
  partnerFiltersSchema,
  partnerParamsSchema,
  recruiterParamsSchema,
  singaporePhoneSchema,
} from './schema.js';
import { exportPartners, listAdminPartners, loginAdmin, markJoined, resetPartnerPassword, setSingaporePhone } from './usecases.js';

const sendCsv = (reply: FastifyReply, fileName: string, csv: string) =>
  reply.header('content-type', CSV_CONTENT_TYPE).header('content-disposition', `attachment; filename="${fileName}"`).send(csv);

export const adminAuthRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post('/admin/auth/google', async (request, reply) => {
    const { credential } = googleLoginSchema.parse(request.body);
    const admin = await loginAdmin(credential);

    await issueSession(reply, { id: admin.id, role: ActorRole.Admin, name: admin.name, email: admin.email });

    return admin;
  });

  app.post('/admin/auth/logout', async (_request, reply) => {
    clearSession(reply, ActorRole.Admin);

    return reply.code(HTTP_STATUS.noContent).send();
  });

  app.get('/admin/auth/me', async request => {
    const actor = await requireSession(request, ActorRole.Admin);

    return { id: actor.id, name: actor.name, email: actor.email };
  });
};

export const adminRoutes = async (app: FastifyInstance): Promise<void> => {
  app.addHook('preHandler', requireAdmin);

  app.get('/admin/partners', async request => listAdminPartners(partnerFiltersSchema.parse(request.query)));

  app.get('/admin/partners/export.csv', async (request, reply) => {
    const csv = await exportPartners(partnerFiltersSchema.parse(request.query), request.actor.id, request.id);

    return sendCsv(reply, EXPORT_FILE_NAME, csv);
  });

  app.put('/admin/partners/:partnerId/singapore-phone', async request => {
    const { partnerId } = partnerParamsSchema.parse(request.params);
    const { singaporePhone } = singaporePhoneSchema.parse(request.body);

    return setSingaporePhone(partnerId, singaporePhone, request.actor.id, request.id);
  });

  app.post('/admin/partners/:partnerId/reset-password', async request => {
    const { partnerId } = partnerParamsSchema.parse(request.params);

    return resetPartnerPassword(partnerId, request.actor.id, request.id);
  });

  app.post('/admin/partners/:partnerId/mark-joined', async request => {
    const { partnerId } = partnerParamsSchema.parse(request.params);

    return markJoined(partnerId, request.actor.id, request.id);
  });

  app.post('/admin/verification-imports', async (request, reply) => {
    const result = await importVerifiedPartners(importSchema.parse(request.body), request.actor.id, request.id);

    return reply.code(HTTP_STATUS.created).send(result);
  });

  app.get('/admin/verification-imports/:importId', async request => {
    const { importId } = importParamsSchema.parse(request.params);

    return getImport(importId);
  });

  app.get('/admin/verification-imports/:importId/failures.csv', async (request, reply) => {
    const { importId } = importParamsSchema.parse(request.params);

    return sendCsv(reply, FAIL_CSV_FILE_NAME, await buildFailCsv(importId));
  });

  app.get('/admin/slot-occupancy', async request => getSlotOccupancy(occupancyQuerySchema.parse(request.query).cityKey));

  app.get('/admin/recruiters', async () => listRecruiters());

  app.post('/admin/recruiters', async (request, reply) => {
    const created = await createRecruiter(createRecruiterSchema.parse(request.body), request.actor.id, request.id);

    return reply.code(HTTP_STATUS.created).send(created);
  });

  app.put('/admin/recruiters/:recruiterId/status', async request => {
    const { recruiterId } = recruiterParamsSchema.parse(request.params);
    const { status } = recruiterStatusSchema.parse(request.body);

    return setRecruiterStatus(recruiterId, status, request.actor.id, request.id);
  });

  app.get('/admin/locks', async () => listAllLocks());
};
