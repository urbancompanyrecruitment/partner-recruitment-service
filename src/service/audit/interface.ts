export enum ActorType {
  Partner = 'partner',
  Admin = 'admin',
  Recruiter = 'recruiter',
  System = 'system',
}

export enum AuditEntityType {
  Partner = 'partner',
  Recruiter = 'recruiter',
  Import = 'import',
  Lock = 'lock',
  Booking = 'booking',
}

export enum AuditAction {
  PartnerSignedUp = 'partner.signed_up',
  PartnerLoggedIn = 'partner.logged_in',
  PartnerPasswordChanged = 'partner.password_changed',
  PartnerPasswordReset = 'partner.password_reset',
  PartnerStateChanged = 'partner.state_changed',
  SingaporePhoneUpdated = 'partner.singapore_phone_updated',
  LeadCreated = 'partner.lead_created',
  PartnersExported = 'partners.exported',
  VerificationImported = 'verification.imported',
  LockCreated = 'lock.created',
  LockPlaced = 'lock.placed',
  LockReleased = 'lock.released',
  LocksDeactivated = 'locks.deactivated',
  PhoneRevealed = 'phone.revealed',
  RecruiterCreated = 'recruiter.created',
  RecruiterStatusChanged = 'recruiter.status_changed',
  RecruiterLoggedIn = 'recruiter.logged_in',
  AdminLoggedIn = 'admin.logged_in',
}

export interface AuditEntry {
  action: AuditAction;
  actorType: ActorType;
  actorId?: string;
  entityType: AuditEntityType;
  entityId: string;
  data?: Record<string, unknown>;
  requestId: string;
}
