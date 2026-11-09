CREATE TABLE partners (
  id                       CHAR(36)         NOT NULL,
  primary_phone_enc        VARBINARY(255)   NOT NULL,
  primary_phone_checksum   CHAR(64)         NOT NULL,
  singapore_phone_enc      VARBINARY(255)   NULL,
  password_hash            VARCHAR(255)     NOT NULL,
  failed_login_count       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  login_locked_until       DATETIME(3)      NULL,
  last_login_at            DATETIME(3)      NULL,
  full_name                VARCHAR(120)     NOT NULL,
  current_country          VARCHAR(64)      NOT NULL,
  current_city             VARCHAR(120)     NOT NULL,
  nationality              VARCHAR(64)      NOT NULL,
  age                      TINYINT UNSIGNED NOT NULL,
  source                   ENUM('tiktok','facebook','referral','recruiter','aggregator','influencer','direct','other') NOT NULL,
  referrer_name            VARCHAR(120)     NULL,
  comfortable_with_dogs    TINYINT(1)       NOT NULL,
  deep_cleaning_experience TINYINT(1)       NOT NULL,
  cooking_frequency        ENUM('never','occasionally','frequently','very_frequently','daily') NOT NULL,
  consent_accepted_at      DATETIME(3)      NOT NULL,
  consent_version          VARCHAR(16)      NOT NULL,
  interview_city_key       VARCHAR(32)      NOT NULL,
  state                    ENUM('signed_up','verified','placed','joined') NOT NULL DEFAULT 'signed_up',
  lead_id                  VARCHAR(64)      NULL,
  onboarding_journey_id    VARCHAR(64)      NULL,
  lead_created_at          DATETIME(3)      NULL,
  approved_at              DATETIME(3)      NULL,
  verified_at              DATETIME(3)      NULL,
  verified_by_admin_id     VARCHAR(64)      NULL,
  verification_import_id   CHAR(36)         NULL,
  created_at               DATETIME(3)      NOT NULL,
  updated_at               DATETIME(3)      NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_partners_primary_phone (primary_phone_checksum),
  KEY ix_partners_state_created (state, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE partner_state_history (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  partner_id  CHAR(36)        NOT NULL,
  from_state  ENUM('signed_up','verified','placed','joined') NULL,
  to_state    ENUM('signed_up','verified','placed','joined') NOT NULL,
  actor_type  ENUM('partner','admin','recruiter','system') NOT NULL,
  actor_id    VARCHAR(64)     NULL,
  reason      VARCHAR(255)    NOT NULL,
  created_at  DATETIME(3)     NOT NULL,
  PRIMARY KEY (id),
  KEY ix_psh_partner (partner_id, created_at),
  CONSTRAINT fk_psh_partner FOREIGN KEY (partner_id) REFERENCES partners (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE slot_bookings (
  id          CHAR(36)    NOT NULL,
  partner_id  CHAR(36)    NOT NULL,
  city_key    VARCHAR(32) NOT NULL,
  starts_at   DATETIME    NOT NULL,
  created_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_slot_bookings_partner (partner_id),
  KEY ix_slot_bookings_slot (city_key, starts_at),
  CONSTRAINT fk_slot_bookings_partner FOREIGN KEY (partner_id) REFERENCES partners (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE recruiters (
  id                   CHAR(36)         NOT NULL,
  email                VARCHAR(190)     NOT NULL,
  full_name            VARCHAR(120)     NOT NULL,
  company              VARCHAR(120)     NOT NULL,
  password_hash        VARCHAR(255)     NOT NULL,
  status               ENUM('active','suspended') NOT NULL DEFAULT 'active',
  failed_login_count   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  login_locked_until   DATETIME(3)      NULL,
  created_by_admin_id  VARCHAR(64)      NOT NULL,
  last_login_at        DATETIME(3)      NULL,
  created_at           DATETIME(3)      NOT NULL,
  updated_at           DATETIME(3)      NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_recruiters_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE recruiter_locks (
  id                     CHAR(36)     NOT NULL,
  partner_id             CHAR(36)     NOT NULL,
  locked_by              CHAR(36)     NOT NULL,
  locked_at              DATETIME(3)  NOT NULL,
  lock_release_at        DATETIME(3)  NOT NULL,
  state                  ENUM('active','inactive') NOT NULL DEFAULT 'active',
  inactive_reason        ENUM('expired','placed','released') NULL,
  inactive_at            DATETIME(3)  NULL,
  employer_name          VARCHAR(160) NULL,
  start_date             DATE         NULL,
  placement_recorded_at  DATETIME(3)  NULL,
  active_partner_id      CHAR(36) GENERATED ALWAYS AS (IF(state = 'active', partner_id, NULL)) STORED,
  created_at             DATETIME(3)  NOT NULL,
  updated_at             DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_locks_one_active_per_partner (active_partner_id),
  KEY ix_locks_partner (partner_id, locked_at),
  KEY ix_locks_recruiter (locked_by, state, locked_at),
  KEY ix_locks_release (state, lock_release_at),
  CONSTRAINT fk_locks_partner FOREIGN KEY (partner_id) REFERENCES partners (id),
  CONSTRAINT fk_locks_recruiter FOREIGN KEY (locked_by) REFERENCES recruiters (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE verification_imports (
  id                    CHAR(36)     NOT NULL,
  uploaded_by_admin_id  VARCHAR(64)  NOT NULL,
  file_name             VARCHAR(255) NOT NULL,
  rows_total            INT UNSIGNED NOT NULL,
  rows_accepted         INT UNSIGNED NOT NULL,
  rows_failed           INT UNSIGNED NOT NULL,
  created_at            DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  KEY ix_imports_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE verification_import_rows (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  import_id          CHAR(36)        NOT NULL,
  row_no             INT UNSIGNED    NOT NULL,
  primary_phone_raw  VARCHAR(32)     NOT NULL,
  outcome            ENUM('accepted','invalid_phone','not_found','no_singapore_number','already_verified','duplicate_in_file','approval_failed') NOT NULL,
  partner_id         CHAR(36)        NULL,
  PRIMARY KEY (id),
  KEY ix_import_rows_import (import_id, row_no),
  CONSTRAINT fk_import_rows_import FOREIGN KEY (import_id) REFERENCES verification_imports (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  action       VARCHAR(48)     NOT NULL,
  actor_type   ENUM('partner','admin','recruiter','system') NOT NULL,
  actor_id     VARCHAR(64)     NULL,
  entity_type  ENUM('partner','recruiter','import','lock','booking') NOT NULL,
  entity_id    VARCHAR(64)     NOT NULL,
  data         JSON            NULL,
  request_id   VARCHAR(64)     NOT NULL,
  created_at   DATETIME(3)     NOT NULL,
  PRIMARY KEY (id),
  KEY ix_audit_entity (entity_type, entity_id, created_at),
  KEY ix_audit_actor (actor_type, actor_id, created_at),
  KEY ix_audit_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
