import { randomUUID } from 'node:crypto';
import { config } from '../config/index.js';
import { AppError, ErrorCode } from '../errors/index.js';
import { logger } from '../logger.js';
import {
  CLIENT_ID_HEADER,
  ONBOARDING_JOURNEY_TYPE,
  ONBOARDING_PATH,
  REQUEST_ID_HEADER,
  STUB_ID_LENGTH,
  STUB_JOURNEY_PREFIX,
  STUB_LEAD_PREFIX,
} from './constant.js';
import type { CreateLeadInput, CreateLeadResult, OnboardingLeadResponse } from './interface.js';

const post = async (path: string, body: unknown, requestId: string): Promise<Response> =>
  fetch(`${config.onboarding.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [CLIENT_ID_HEADER]: config.onboarding.clientId,
      [REQUEST_ID_HEADER]: requestId,
    },
    body: JSON.stringify(body),
  });

export const createLead = async ({ phone, partnerId }: CreateLeadInput, requestId: string): Promise<CreateLeadResult> => {
  if (!config.onboarding.baseUrl) {
    logger.info({ method: 'createLead', partnerId, key_1: 'mode', key_1_value: 'stub' });

    return {
      leadId: `${STUB_LEAD_PREFIX}${randomUUID().slice(0, STUB_ID_LENGTH)}`,
      journeyId: `${STUB_JOURNEY_PREFIX}${randomUUID().slice(0, STUB_ID_LENGTH)}`,
    };
  }

  const response = await post(
    ONBOARDING_PATH.createLead,
    {
      phone,
      categoryKey: config.onboarding.categoryKey,
      cityKey: config.onboarding.cityKey,
      sourceType: config.onboarding.sourceType,
      sourceId: partnerId,
    },
    requestId,
  ).catch((error: Error) => {
    logger.error({ method: 'createLead', partnerId, message: 'createLead request failed', error: error?.message || error?.stack });

    throw new AppError(ErrorCode.LeadCreationFailed);
  });

  if (!response.ok) {
    logger.error({ method: 'createLead', partnerId, message: 'createLead rejected', key_1: 'status', key_1_value: String(response.status) });

    throw new AppError(ErrorCode.LeadCreationFailed, { status: response.status });
  }

  const body = (await response.json()) as OnboardingLeadResponse;
  const leadId = body.data?.leadId ?? body.data?.lead_id ?? body.leadId ?? body.lead_id;
  const journeyId = body.data?.journeyId ?? body.data?.journey_id ?? body.journeyId ?? body.journey_id;

  if (!leadId) throw new AppError(ErrorCode.LeadCreationFailed, { reason: 'missing_lead_id' });

  return { leadId, journeyId: journeyId ?? '' };
};

export const bulkApproveJourney = async (leadIds: string[], actionBy: string, requestId: string): Promise<boolean> => {
  if (!config.onboarding.baseUrl) {
    logger.info({ method: 'bulkApproveJourney', key_1: 'mode', key_1_value: 'stub', key_2: 'lead_count', key_2_value: String(leadIds.length) });

    return true;
  }

  const response = await post(
    ONBOARDING_PATH.bulkApproveJourney,
    { requests: leadIds.map(leadId => ({ userId: leadId, journeyType: ONBOARDING_JOURNEY_TYPE, actionBy })) },
    requestId,
  ).catch((error: Error) => {
    logger.error({ method: 'bulkApproveJourney', message: 'bulkApproveJourney request failed', error: error?.message || error?.stack });

    return undefined;
  });

  return Boolean(response?.ok);
};
