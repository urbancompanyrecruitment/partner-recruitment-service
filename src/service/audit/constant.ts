import { ActorRole } from '../../common/auth/interface.js';
import { ActorType } from './interface.js';

export const ACTOR_TYPE_BY_ROLE: Record<ActorRole, ActorType> = {
  [ActorRole.Partner]: ActorType.Partner,
  [ActorRole.Admin]: ActorType.Admin,
  [ActorRole.Recruiter]: ActorType.Recruiter,
};

export const SYSTEM_REQUEST_ID = 'system';
