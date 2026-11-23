import type { FastifyInstance, FastifyReply } from 'fastify';
import { ActorRole, changePasswordSchema, clearSession, issueSession } from '../../common/auth/index.js';
import { pool } from '../../common/db/index.js';
import { HTTP_STATUS } from '../../common/errors/constant.js';
import { addAggregator, addAggregatorSchema, aggregatorParamsSchema, removeAggregator } from '../aggregator/index.js';
import { hubImportSchema, importHubs } from '../hub/index.js';
import { getSlotOccupancy, importSlots, INTERVIEW_CENTRES, slotImportSchema } from '../interview/index.js';
import { assignPartner, assignRecruiterSchema, listAllLocks } from '../lock/index.js';
import {
  createRecruiter,
  createRecruiterSchema,
  recruiterStatusSchema,
  resetRecruiterPassword,
  setRecruiterStatus,
} from '../recruiter/index.js';
import { buildFailCsv, getImport, importParamsSchema, importSchema, importVerifiedPartners } from '../verification/index.js';
import {
  changeAdminPassword,
  createAdmin,
  listAdmins,
  loginAdmin,
  requireAdminRow,
  resetAdminPassword,
  setAdminStatus,
  toAdminView,
} from './accounts.js';
import {
  ADMIN_LOGIN_RATE_LIMIT,
  CSV_CONTENT_TYPE,
  EXPORT_FILE_NAME,
  FAIL_CSV_FILE_NAME,
  OPS_UPLOAD_FILE_NAME,
} from './constant.js';
import { requireAdmin, requireSuperAdmin } from './guard.js';
import {
  adminLoginSchema,
  adminParamsSchema,
  adminStatusSchema,
  createAdminSchema,
  occupancyQuerySchema,
  partnerFiltersSchema,
  partnerParamsSchema,
  recruiterParamsSchema,
  singaporePhoneSchema,
} from './schema.js';
import {
  exportPartners,
  exportPartnersForOps,
  listAdminPartners,
  listRecruitersWithStats,
  markJoined,
  setSingaporePhone,
} from './usecases.js';

const sendCsv = (reply: FastifyReply, fileName: string, csv: string) =>
  reply.header('content-type', CSV_CONTENT_TYPE).header('content-disposition', `attachment; filename="${fileName}"`).send(csv);

export const adminAuthRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post('/admin/auth/login', { config: { rateLimit: ADMIN_LOGIN_RATE_LIMIT } }, async (request, reply) => {
    const admin = await loginAdmin(adminLoginSchema.parse(request.body), request.id);

    await issueSession(reply, { id: admin.id, role: ActorRole.Admin, name: admin.name, email: admin.email });

    return admin;
  });

  app.post('/admin/auth/logout', async (_request, reply) => {
    clearSession(reply, ActorRole.Admin);

    return reply.code(HTTP_STATUS.noContent).send();
  });

  app.get('/admin/auth/me', async (request, reply) => {
    await requireAdmin(request, reply);

    return toAdminView(await requireAdminRow(pool, request.actor.id));
  });
};

export const adminAccountRoutes = async (app: FastifyInstance): Promise<void> => {
  app.addHook('preHandler', requireSuperAdmin);

  app.get('/admin/admins', async () => listAdmins());

  app.post('/admin/admins', async (request, reply) => {
    const created = await createAdmin(createAdminSchema.parse(request.body), request.actor.id, request.id);

    return reply.code(HTTP_STATUS.created).send(created);
  });

  app.put('/admin/admins/:adminId/status', async request => {
    const { adminId } = adminParamsSchema.parse(request.params);
    const { status } = adminStatusSchema.parse(request.body);

    return setAdminStatus(adminId, status, request.actor.id, request.id);
  });

  app.post('/admin/admins/:adminId/reset-password', async request => {
    const { adminId } = adminParamsSchema.parse(request.params);

    return resetAdminPassword(adminId, request.actor.id, request.id);
  });
};

export const adminRoutes = async (app: FastifyInstance): Promise<void> => {
  app.addHook('preHandler', async (request, reply) => {
    await requireAdmin(request, reply);
  });

  app.post('/admin/change-password', async (request, reply) => {
    await changeAdminPassword(request.actor.id, changePasswordSchema.parse(request.body), request.id);

    return reply.code(HTTP_STATUS.noContent).send();
  });

  app.get('/admin/partners', async request => listAdminPartners(partnerFiltersSchema.parse(request.query)));

  app.get('/admin/partners/export.csv', async (request, reply) => {
    const csv = await exportPartners(partnerFiltersSchema.parse(request.query), request.actor.id, request.id);

    return sendCsv(reply, EXPORT_FILE_NAME, csv);
  });

  app.get('/admin/partners/ops-lead-upload.csv', async (request, reply) => {
    const csv = await exportPartnersForOps(partnerFiltersSchema.parse(request.query), request.actor.id, request.id);

    return sendCsv(reply, OPS_UPLOAD_FILE_NAME, csv);
  });

  app.put('/admin/partners/:partnerId/singapore-phone', async request => {
    const { partnerId } = partnerParamsSchema.parse(request.params);
    const { singaporePhone } = singaporePhoneSchema.parse(request.body);

    return setSingaporePhone(partnerId, singaporePhone, request.actor.id, request.id);
  });

  app.post('/admin/partners/:partnerId/assign-recruiter', async (request, reply) => {
    const { partnerId } = partnerParamsSchema.parse(request.params);
    const { recruiterId } = assignRecruiterSchema.parse(request.body);
    const lock = await assignPartner(partnerId, recruiterId, request.actor.id, request.id);

    return reply.code(HTTP_STATUS.created).send(lock);
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

  app.post('/admin/hub-imports', async request => importHubs(hubImportSchema.parse(request.body), request.actor.id, request.id));

  app.get('/admin/slot-occupancy', async request => getSlotOccupancy(occupancyQuerySchema.parse(request.query).cityKey));

  app.get('/admin/interview-centres', async () => INTERVIEW_CENTRES);

  app.post('/admin/slot-imports', async request => importSlots(slotImportSchema.parse(request.body), request.actor.id, request.id));

  app.get('/admin/recruiters', async () => listRecruitersWithStats());

  app.post('/admin/recruiters', async (request, reply) => {
    const created = await createRecruiter(createRecruiterSchema.parse(request.body), request.actor.id, request.id);

    return reply.code(HTTP_STATUS.created).send(created);
  });

  app.put('/admin/recruiters/:recruiterId/status', async request => {
    const { recruiterId } = recruiterParamsSchema.parse(request.params);
    const { status } = recruiterStatusSchema.parse(request.body);

    return setRecruiterStatus(recruiterId, status, request.actor.id, request.id);
  });

  app.post('/admin/recruiters/:recruiterId/reset-password', async request => {
    const { recruiterId } = recruiterParamsSchema.parse(request.params);

    return resetRecruiterPassword(recruiterId, request.actor.id, request.id);
  });

  app.post('/admin/recruiters/:recruiterId/aggregators', async (request, reply) => {
    const { recruiterId } = recruiterParamsSchema.parse(request.params);
    const aggregator = await addAggregator(recruiterId, addAggregatorSchema.parse(request.body), request.actor.id, request.id);

    return reply.code(HTTP_STATUS.created).send(aggregator);
  });

  app.delete('/admin/recruiters/:recruiterId/aggregators/:aggregatorId', async (request, reply) => {
    const { recruiterId, aggregatorId } = aggregatorParamsSchema.parse(request.params);

    await removeAggregator(recruiterId, aggregatorId, request.actor.id, request.id);

    return reply.code(HTTP_STATUS.noContent).send();
  });

  app.get('/admin/locks', async () => listAllLocks());
};
