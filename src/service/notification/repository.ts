import { execute, query, type ExecuteResult, type Queryable } from '../../common/db/index.js';
import { NOTIFICATION_LIST_LIMIT } from './constant.js';
import type { NotificationData, NotificationRow, PartnerNotificationType } from './interface.js';

export const insertNotification = (
  db: Queryable,
  id: string,
  partnerId: string,
  type: PartnerNotificationType,
  data: NotificationData | undefined,
): Promise<ExecuteResult> =>
  execute(db, 'INSERT INTO partner_notifications (id, partner_id, type, data, created_at) VALUES (?, ?, ?, ?, LOCALTIMESTAMP(3))', [
    id,
    partnerId,
    type,
    data ? JSON.stringify(data) : null,
  ]);

export const listNotificationRows = (db: Queryable, partnerId: string): Promise<NotificationRow[]> =>
  query<NotificationRow>(db, 'SELECT * FROM partner_notifications WHERE partner_id = ? ORDER BY created_at DESC, id DESC LIMIT ?', [
    partnerId,
    NOTIFICATION_LIST_LIMIT,
  ]);

export const markNotificationRowsRead = (db: Queryable, partnerId: string): Promise<ExecuteResult> =>
  execute(db, 'UPDATE partner_notifications SET read_at = LOCALTIMESTAMP(3) WHERE partner_id = ? AND read_at IS NULL', [partnerId]);
