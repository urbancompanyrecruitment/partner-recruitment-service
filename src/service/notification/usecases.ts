import { randomUUID } from 'node:crypto';
import { pool, type Queryable } from '../../common/db/index.js';
import { logger } from '../../common/logger.js';
import { toIsoDateTime } from '../../common/time.js';
import type { NotificationData, NotificationList, PartnerNotificationType } from './interface.js';
import { insertNotification, listNotificationRows, markNotificationRowsRead } from './repository.js';

export const notifyPartner = async (
  db: Queryable,
  partnerId: string,
  type: PartnerNotificationType,
  data?: NotificationData,
): Promise<void> => {
  await insertNotification(db, randomUUID(), partnerId, type, data);

  logger.info({ method: 'notifyPartner', partnerId, key_1: 'type', key_1_value: type });
};

export const listPartnerNotifications = async (partnerId: string): Promise<NotificationList> => {
  const rows = await listNotificationRows(pool, partnerId);

  return {
    notifications: rows.map(row => ({
      id: row.id,
      type: row.type,
      data: row.data ?? undefined,
      read: Boolean(row.read_at),
      createdAt: toIsoDateTime(row.created_at),
    })),
    unreadCount: rows.filter(row => !row.read_at).length,
  };
};

export const markPartnerNotificationsRead = async (partnerId: string): Promise<void> => {
  await markNotificationRowsRead(pool, partnerId);
};
