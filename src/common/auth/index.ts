import type { FastifyReply, FastifyRequest } from 'fastify';
import { jwtVerify, SignJWT } from 'jose';
import { config } from '../config/index.js';
import { AppError, ErrorCode } from '../errors/index.js';
import { COOKIE_PATH, JWT_ALGORITHM, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from './constant.js';
import { ActorRole, type Actor, type SessionClaims } from './interface.js';

const secret = new TextEncoder().encode(config.sessionSecret);

export const issueSession = async (reply: FastifyReply, actor: Actor): Promise<void> => {
  const claims: SessionClaims = { sub: actor.id, role: actor.role, name: actor.name, email: actor.email };
  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS[actor.role]}s`)
    .sign(secret);

  reply.setCookie(SESSION_COOKIE[actor.role], token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: COOKIE_PATH,
    maxAge: SESSION_MAX_AGE_SECONDS[actor.role],
  });
};

export const clearSession = (reply: FastifyReply, role: ActorRole): void => {
  reply.clearCookie(SESSION_COOKIE[role], { path: COOKIE_PATH });
};

export const readSession = async (request: FastifyRequest, role: ActorRole): Promise<Actor | undefined> => {
  const token = request.cookies[SESSION_COOKIE[role]];

  if (!token) return undefined;

  const verified = await jwtVerify<SessionClaims>(token, secret, { algorithms: [JWT_ALGORITHM] }).catch(() => undefined);

  if (!verified || verified.payload.role !== role || !verified.payload.sub) return undefined;

  return { id: verified.payload.sub, role, name: verified.payload.name, email: verified.payload.email };
};

export const requireSession = async (request: FastifyRequest, role: ActorRole): Promise<Actor> => {
  const actor = await readSession(request, role);

  if (!actor) throw new AppError(ErrorCode.Unauthorized);

  return actor;
};

export { ActorRole } from './interface.js';
export type { Actor } from './interface.js';
