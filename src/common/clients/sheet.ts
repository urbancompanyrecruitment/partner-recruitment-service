import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { SHEET_TIMEOUT_MS } from './constant.js';
import type { SheetWebhookResponse } from './interface.js';

export const isSheetConfigured = (): boolean => Boolean(config.signupSheet.webhookUrl);

export const appendSheetRow = async (headers: string[], values: string[]): Promise<boolean> => {
  if (!config.signupSheet.webhookUrl) return false;

  const response = await fetch(config.signupSheet.webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: config.signupSheet.secret ?? '', headers, values }),
    signal: AbortSignal.timeout(SHEET_TIMEOUT_MS),
  }).catch((error: Error) => {
    logger.error({ method: 'appendSheetRow', message: 'Sheet webhook request failed', error: error?.message || error?.stack });

    return undefined;
  });

  if (!response?.ok) return false;

  const body = (await response.json().catch(() => ({}))) as SheetWebhookResponse;

  if (!body.ok) {
    logger.error({ method: 'appendSheetRow', message: 'Sheet webhook rejected the row', error: body.error ?? 'unknown' });
  }

  return Boolean(body.ok);
};
