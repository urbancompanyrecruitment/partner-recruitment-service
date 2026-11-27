import { count, execute, queryOne, type ExecuteResult, type Queryable } from '../../common/db/index.js';
import type { NewPasswordResetToken, PasswordResetAccountType, PasswordResetTokenRow } from './interface.js';

export const insertResetToken = (db: Queryable, token: NewPasswordResetToken): Promise<ExecuteResult> =>
  execute(
    db,
    `INSERT INTO password_reset_tokens (id, account_type, account_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, LOCALTIMESTAMP(3))`,
    [token.id, token.accountType, token.accountId, token.tokenHash, token.expiresAt],
  );

export const countRecentResetTokens = (
  db: Queryable,
  accountType: PasswordResetAccountType,
  accountId: string,
  since: Date,
): Promise<number> =>
  count(db, 'SELECT COUNT(*) AS total FROM password_reset_tokens WHERE account_type = ? AND account_id = ? AND created_at > ?', [
    accountType,
    accountId,
    since,
  ]);

export const findUsableResetToken = (
  db: Queryable,
  accountType: PasswordResetAccountType,
  tokenHash: string,
): Promise<PasswordResetTokenRow | undefined> =>
  queryOne<PasswordResetTokenRow>(
    db,
    `SELECT * FROM password_reset_tokens
     WHERE account_type = ? AND token_hash = ? AND used_at IS NULL AND expires_at > LOCALTIMESTAMP(3)`,
    [accountType, tokenHash],
  );

export const voidResetLinks = (db: Queryable, accountType: PasswordResetAccountType, accountId: string): Promise<ExecuteResult> =>
  execute(
    db,
    'UPDATE password_reset_tokens SET used_at = LOCALTIMESTAMP(3) WHERE account_type = ? AND account_id = ? AND used_at IS NULL',
    [accountType, accountId],
  );

export const deleteStaleResetTokens = (
  db: Queryable,
  accountType: PasswordResetAccountType,
  accountId: string,
  before: Date,
): Promise<ExecuteResult> =>
  execute(db, 'DELETE FROM password_reset_tokens WHERE account_type = ? AND account_id = ? AND created_at < ? AND (used_at IS NOT NULL OR expires_at < ?)', [
    accountType,
    accountId,
    before,
    before,
  ]);
