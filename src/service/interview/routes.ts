import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCity, listBookableSlots, listCities } from './index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';

const slotsQuerySchema = z.object({ cityKey: z.string().min(1) });

export const interviewRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/partner/interview-cities', async () => listCities());

  app.get('/partner/interview-slots', async request => {
    const { cityKey } = slotsQuerySchema.parse(request.query);

    if (!getCity(cityKey)) throw new AppError(ErrorCode.UnknownCity, { cityKey });

    return listBookableSlots(cityKey);
  });
};
