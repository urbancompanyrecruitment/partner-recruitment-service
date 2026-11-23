import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { getCity, listBookableSlots, listCities } from './index.js';

const citiesQuerySchema = z.object({ country: z.string().trim().min(1).optional() });

const slotsQuerySchema = z.object({ cityKey: z.string().min(1) });

export const interviewRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/partner/interview-cities', async request => listCities(citiesQuerySchema.parse(request.query).country));

  app.get('/partner/interview-slots', async request => {
    const { cityKey } = slotsQuerySchema.parse(request.query);
    const city = await getCity(cityKey);

    if (!city) throw new AppError(ErrorCode.UnknownCity, { cityKey });

    return listBookableSlots(cityKey);
  });
};
