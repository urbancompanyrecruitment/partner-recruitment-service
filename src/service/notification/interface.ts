export enum PartnerNotificationType {
  Verified = 'verified',
  Placement = 'placement',
}

export type NotificationData = Record<string, string>;

export interface NotificationRow {
  id: string;
  partner_id: string;
  type: PartnerNotificationType;
  data: NotificationData | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationView {
  id: string;
  type: PartnerNotificationType;
  data?: NotificationData;
  read: boolean;
  createdAt: string;
}

export interface NotificationList {
  notifications: NotificationView[];
  unreadCount: number;
}
