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

export interface LoginFailure {
  failedCount: number;
  lockedUntil: Date | null;
}
