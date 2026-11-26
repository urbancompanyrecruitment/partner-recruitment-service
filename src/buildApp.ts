import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { config } from './common/config/index.js';
import { NodeEnvironment } from './common/config/interface.js';
import { HTTP_STATUS } from './common/errors/constant.js';
import { AppError, ErrorCode } from './common/errors/index.js';
import type { Actor } from './common/auth/index.js';
import { logger } from './common/logger.js';
import { adminAccountRoutes, adminAuthRoutes, adminRoutes } from './service/admin/index.js';
import { interviewRoutes } from './service/interview/routes.js';
import { lockCronRoutes, lockRoutes } from './service/lock/index.js';
import { notificationRoutes } from './service/notification/index.js';
import { partnerRoutes } from './service/partner/index.js';
import { recruiterRoutes } from './service/recruiter/index.js';
import { API_PREFIX, HEALTHCHECK_PATH } from './constant.js';

const toValidationError = (error: ZodError): AppError =>
  new AppError(ErrorCode.ValidationFailed, {
    issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
  });

export const fastifyOptions = () => ({ loggerInstance: logger, genReqId: () => randomUUID(), trustProxy: true });

export const buildApp = async (app = Fastify(fastifyOptions())) => {

  app.decorateRequest('actor', null as unknown as Actor);

  await app.register(cookie);

  if (config.nodeEnv !== NodeEnvironment.Test) await app.register(rateLimit, { global: false });

  app.setErrorHandler((error: FastifyError | AppError | ZodError, request, reply) => {
    const appError = error instanceof AppError ? error : error instanceof ZodError ? toValidationError(error) : undefined;

    if (appError) return reply.code(appError.status).send(appError.toBody());

    const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : HTTP_STATUS.internalError;

    if (statusCode < HTTP_STATUS.internalError) {
      return reply.code(statusCode).send({ error: { code: ErrorCode.RequestRejected, message: error.message } });
    }

    request.log.error({ method: 'errorHandler', message: 'Unhandled error', error: error?.message || error?.stack });

    return reply.code(HTTP_STATUS.internalError).send(new AppError(ErrorCode.InternalError).toBody());
  });

  app.setNotFoundHandler((_request, reply) => reply.code(HTTP_STATUS.notFound).send(new AppError(ErrorCode.NotFound).toBody()));

  app.get(HEALTHCHECK_PATH, async () => ({ status: 'ok' }));

  await app.register(
    async api => {
      await api.register(interviewRoutes);

      await api.register(partnerRoutes);

      await api.register(notificationRoutes);

      await api.register(recruiterRoutes);

      await api.register(lockRoutes);

      await api.register(lockCronRoutes);

      await api.register(adminAuthRoutes);

      await api.register(adminAccountRoutes);

      await api.register(adminRoutes);
    },
    { prefix: API_PREFIX },
  );

  return app;
};

export type App = Awaited<ReturnType<typeof buildApp>>;
