export interface SheetWebhookResponse {
  ok?: boolean;
  error?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}
