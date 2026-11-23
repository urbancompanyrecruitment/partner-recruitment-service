import type { z } from 'zod';
import type { changePasswordSchema } from './schema.js';

export enum ActorRole {
  Partner = 'partner',
  Admin = 'admin',
  Recruiter = 'recruiter',
}

export interface Actor {
  id: string;
  role: ActorRole;
  name: string;
  email?: string;
}

export interface SessionClaims {
  sub: string;
  role: ActorRole;
  name: string;
  email?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor;
  }
}

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export interface TemporaryPasswordResult {
  temporaryPassword: string;
}

export interface LoginFailure {
  failedCount: number;
  lockedUntil: Date | null;
}
