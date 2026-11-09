import { OAuth2Client } from 'google-auth-library';
import { config } from '../../common/config/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import type { GoogleIdentity } from './interface.js';

const client = new OAuth2Client(config.googleClientId);

export const verifyGoogleCredential = async (credential: string): Promise<GoogleIdentity> => {
  const ticket = await client.verifyIdToken({ idToken: credential, audience: config.googleClientId }).catch(() => undefined);
  const payload = ticket?.getPayload();

  if (!payload?.sub || !payload.email || !payload.email_verified) throw new AppError(ErrorCode.InvalidCredentials);

  return { id: payload.sub, email: payload.email.toLowerCase(), name: payload.name ?? payload.email };
};
