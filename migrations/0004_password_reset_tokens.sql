CREATE TABLE password_reset_tokens (
  id            VARCHAR(36)  NOT NULL,
  account_type  VARCHAR(16)  NOT NULL,
  account_id    VARCHAR(36)  NOT NULL,
  token_hash    VARCHAR(64)  NOT NULL,
  expires_at    TIMESTAMP(3) NOT NULL,
  used_at       TIMESTAMP(3) NULL,
  created_at    TIMESTAMP(3) NOT NULL,
  CONSTRAINT pk_password_reset_tokens PRIMARY KEY (id),
  CONSTRAINT uk_password_reset_tokens_hash UNIQUE (token_hash),
  CONSTRAINT ck_password_reset_tokens_account_type CHECK (account_type IN ('recruiter', 'admin'))
);

CREATE INDEX ix_password_reset_tokens_account ON password_reset_tokens (account_type, account_id, created_at);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE recruiters ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE admins ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
