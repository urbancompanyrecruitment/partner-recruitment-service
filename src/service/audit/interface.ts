export enum ActorType {
  Partner = 'partner',
  Admin = 'admin',
  Recruiter = 'recruiter',
  System = 'system',
}

export enum AuditEntityType {
  Partner = 'partner',
  Recruiter = 'recruiter',
  Admin = 'admin',
  Import = 'import',
  Lock = 'lock',
  Booking = 'booking',
  Aggregator = 'aggregator',
}

export enum AuditAction {
  PartnerSignedUp = 'partner.signed_up',
  PartnerLoggedIn = 'partner.logged_in',
  PartnerSlotRescheduled = 'partner.slot_rescheduled',
  PartnerStateChanged = 'partner.state_changed',
  SingaporePhoneUpdated = 'partner.singapore_phone_updated',
  LeadCreated = 'partner.lead_created',
  LeadApproved = 'partner.lead_approved',
  HubUpdated = 'partner.hub_updated',
  PartnersExported = 'partners.exported',
  PartnersOpsUploadExported = 'partners.ops_upload_exported',
  VerificationImported = 'verification.imported',
  SlotsImported = 'slots.imported',
  LockCreated = 'lock.created',
  LockPlaced = 'lock.placed',
  LockReleased = 'lock.released',
  LocksDeactivated = 'locks.deactivated',
  PhoneRevealed = 'phone.revealed',
  RecruiterCreated = 'recruiter.created',
  RecruiterSignedUp = 'recruiter.signed_up',
  RecruiterStatusChanged = 'recruiter.status_changed',
  RecruiterLoggedIn = 'recruiter.logged_in',
  RecruiterPasswordChanged = 'recruiter.password_changed',
  RecruiterPasswordReset = 'recruiter.password_reset',
  AggregatorAdded = 'aggregator.added',
  AggregatorRemoved = 'aggregator.removed',
  AdminLoggedIn = 'admin.logged_in',
  AdminCreated = 'admin.created',
  AdminStatusChanged = 'admin.status_changed',
  AdminPasswordChanged = 'admin.password_changed',
  AdminPasswordReset = 'admin.password_reset',
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
