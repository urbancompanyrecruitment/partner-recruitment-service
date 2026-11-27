import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { isMailConfigured, sendMail, touchMailServer } from '../../common/clients/mail.js';
import { config } from '../../common/config/index.js';
import { hashPassword } from '../../common/crypto/password.js';
import { pool, withTransaction } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { dayjs } from '../../common/time.js';
import { findAdminByEmail, updateAdminPasswordHash } from '../admin/repository.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import { findRecruiterByEmail, updateRecruiterPasswordHash } from '../recruiter/repository.js';
import {
  RESET_MAIL_APP_NAME,
  RESET_MAIL_SUBJECT,
  RESET_PAGE_PATH,
  RESET_REQUEST_WINDOW_MINUTES,
  RESET_REQUESTS_PER_WINDOW,
  RESET_TOKEN_BYTES,
  RESET_TOKEN_FRAGMENT_KEY,
  RESET_TOKEN_HASH_ALGORITHM,
  RESET_TOKEN_TTL_MINUTES,
  STALE_TOKEN_RETENTION_HOURS,
} from './constant.js';
import { PasswordResetAccountType, type ResettableAccountRow, type ResettableAccountStore } from './interface.js';
import { countRecentResetTokens, deleteStaleResetTokens, findUsableResetToken, insertResetToken, voidResetLinks } from './repository.js';

const ACCOUNT_STORE: Record<PasswordResetAccountType, ResettableAccountStore> = {
  [PasswordResetAccountType.Recruiter]: {
    actorType: ActorType.Recruiter,
    entityType: AuditEntityType.Recruiter,
    lockKey: lockKey.recruiter,
    findByEmail: findRecruiterByEmail,
    updatePasswordHash: updateRecruiterPasswordHash,
  },
  [PasswordResetAccountType.Admin]: {
    actorType: ActorType.Admin,
    entityType: AuditEntityType.Admin,
    lockKey: lockKey.admin,
    findByEmail: findAdminByEmail,
    updatePasswordHash: updateAdminPasswordHash,
  },
};

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => HTML_ESCAPES[character]);

const hashResetToken = (token: string): string => createHash(RESET_TOKEN_HASH_ALGORITHM).update(token).digest('hex');

const resetMail = (account: ResettableAccountRow, link: string) => ({
  to: account.email,
  subject: RESET_MAIL_SUBJECT,
  text: [
    `Hi ${account.full_name},`,
    '',
    `Someone asked to reset the password of your ${RESET_MAIL_APP_NAME} account. Open this link to choose a new password:`,
    link,
    '',
    `The link works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes. If you did not ask for this, ignore this email; your password stays the same.`,
  ].join('\n'),
  html: [
    `<p>Hi ${escapeHtml(account.full_name)},</p>`,
    `<p>Someone asked to reset the password of your ${RESET_MAIL_APP_NAME} account. Open this link to choose a new password:</p>`,
    `<p><a href="${link}">Choose a new password</a></p>`,
    `<p>The link works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes. If you did not ask for this, ignore this email; your password stays the same.</p>`,
  ].join(''),
});

// Reserves a link for the account under its lock, so simultaneous requests cannot pass the per-account cap together.
const reserveResetToken = (accountType: PasswordResetAccountType, accountId: string): Promise<string | undefined> =>
  withCriticalSection([ACCOUNT_STORE[accountType].lockKey(accountId)], connection =>
    withTransaction(connection, async () => {
      await deleteStaleResetTokens(connection, accountType, accountId, dayjs().subtract(STALE_TOKEN_RETENTION_HOURS, 'hour').toDate());

      const windowStart = dayjs().subtract(RESET_REQUEST_WINDOW_MINUTES, 'minute').toDate();

      if ((await countRecentResetTokens(connection, accountType, accountId, windowStart)) >= RESET_REQUESTS_PER_WINDOW) return undefined;

      const token = randomBytes(RESET_TOKEN_BYTES).toString('base64url');

      await insertResetToken(connection, {
        id: randomUUID(),
        accountType,
        accountId,
        tokenHash: hashResetToken(token),
        expiresAt: dayjs().add(RESET_TOKEN_TTL_MINUTES, 'minute').toDate(),
      });

      return token;
    }),
  );

const sendResetLink = async (accountType: PasswordResetAccountType, email: string, requestId: string): Promise<void> => {
  if (!config.portalBaseUrl || !isMailConfigured()) {
    logger.error({ method: 'requestPasswordReset', message: 'Reset email not sent: set PORTAL_BASE_URL, SMTP_HOST and MAIL_FROM' });

    return;
  }

  const store = ACCOUNT_STORE[accountType];
  const account = await store.findByEmail(pool, email);
  const token = account ? await reserveResetToken(accountType, account.id) : undefined;

  if (!account || !token) {
    logger.info({ method: 'requestPasswordReset', key_1: 'account_type', key_1_value: accountType, key_2: 'link_sent', key_2_value: 'false' });

    // Same mail-server round trip as a real send, so a slow mail server slows every answer alike.
    await touchMailServer();

    return;
  }

  const sent = await sendMail(resetMail(account, `${config.portalBaseUrl}${RESET_PAGE_PATH[accountType]}#${RESET_TOKEN_FRAGMENT_KEY}=${token}`));

  await recordAudit(pool, {
    action: AuditAction.PasswordResetRequested,
    actorType: store.actorType,
    entityType: store.entityType,
    entityId: account.id,
    data: { emailSent: sent },
    requestId,
  });

  logger.info({ method: 'requestPasswordReset', key_1: 'account_id', key_1_value: account.id, key_2: 'email_sent', key_2_value: String(sent) });
};

// Every request takes the same time and never fails, so the answer does not reveal whether the email has an account.
export const requestPasswordReset = async (accountType: PasswordResetAccountType, email: string, requestId: string): Promise<void> => {
  const answerAt = Date.now() + config.forgotPasswordResponseMs;

  await sendResetLink(accountType, email, requestId).catch((error: Error) => {
    logger.error({ method: 'requestPasswordReset', message: 'Reset request failed', error: error?.message || error?.stack });
  });

  const remainingMs = answerAt - Date.now();

  if (remainingMs > 0) await setTimeout(remainingMs);

  if (remainingMs <= 0) {
    logger.warn({ method: 'requestPasswordReset', message: 'Reset request took longer than the fixed answer time', key_1: 'overrun_ms', key_1_value: String(-remainingMs) });
  }
};

export const resetPassword = async (
  accountType: PasswordResetAccountType,
  token: string,
  newPassword: string,
  requestId: string,
): Promise<void> => {
  const store = ACCOUNT_STORE[accountType];
  const tokenHash = hashResetToken(token);
  const found = await findUsableResetToken(pool, accountType, tokenHash);

  if (!found) throw new AppError(ErrorCode.ResetLinkInvalid);

  await withCriticalSection([store.lockKey(found.account_id)], async connection => {
    const usable = await findUsableResetToken(connection, accountType, tokenHash);

    if (!usable) throw new AppError(ErrorCode.ResetLinkInvalid);

    // Hashed only under the account lock, after the re-check, so parallel uses of one link cost one hash.
    const passwordHash = await hashPassword(newPassword);

    await withTransaction(connection, async () => {
      const updated = await store.updatePasswordHash(connection, usable.account_id, passwordHash);

      if (updated.affectedRows !== 1) throw new AppError(ErrorCode.ResetLinkInvalid);

      await voidResetLinks(connection, accountType, usable.account_id);

      await recordAudit(connection, {
        action: AuditAction.PasswordResetCompleted,
        actorType: store.actorType,
        actorId: usable.account_id,
        entityType: store.entityType,
        entityId: usable.account_id,
        requestId,
      });
    });
  });

  logger.info({ method: 'resetPassword', key_1: 'account_type', key_1_value: accountType, key_2: 'account_id', key_2_value: found.account_id });
};
