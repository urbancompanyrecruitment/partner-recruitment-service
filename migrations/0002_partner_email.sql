ALTER TABLE partners
  ADD COLUMN email_enc      VARBINARY(255) NULL AFTER singapore_phone_enc,
  ADD COLUMN email_checksum CHAR(64)       NULL AFTER email_enc,
  ADD UNIQUE KEY uk_partners_email (email_checksum);
