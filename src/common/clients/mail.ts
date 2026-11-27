import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { MAIL_TIMEOUT_MS } from './constant.js';
import type { MailMessage } from './interface.js';

let transporter: Transporter | undefined;

const getTransporter = (): Transporter => {
  transporter ??= nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    requireTLS: config.mail.requireTls && !config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.password } : undefined,
    connectionTimeout: MAIL_TIMEOUT_MS,
    greetingTimeout: MAIL_TIMEOUT_MS,
    socketTimeout: MAIL_TIMEOUT_MS,
  });

  return transporter;
};

export const isMailConfigured = (): boolean => Boolean(config.mail.host && config.mail.from);

export const sendMail = async (message: MailMessage): Promise<boolean> => {
  if (!isMailConfigured()) {
    logger.error({ method: 'sendMail', message: 'Mail is not configured; set SMTP_HOST and MAIL_FROM' });

    return false;
  }

  return getTransporter()
    .sendMail({ from: config.mail.from, ...message })
    .then(() => true)
    .catch((error: Error) => {
      logger.error({ method: 'sendMail', message: 'Sending mail failed', error: error?.message || error?.stack });

      return false;
    });
};

export const touchMailServer = async (): Promise<void> => {
  if (!isMailConfigured()) return;

  await getTransporter()
    .verify()
    .catch((error: Error) => {
      logger.error({ method: 'touchMailServer', message: 'Mail server check failed', error: error?.message || error?.stack });
    });
};
