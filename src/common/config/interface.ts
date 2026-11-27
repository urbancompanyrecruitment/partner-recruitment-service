export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export interface OpsLeadUploadConfig {
  cityKey: string;
  categoryKey: string;
  sourceType: string;
  experimentName: string;
}

export interface SignupSheetConfig {
  webhookUrl?: string;
  secret?: string;
}

export interface MailConfig {
  host?: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user?: string;
  password?: string;
  from?: string;
}

export interface Config {
  nodeEnv: NodeEnvironment;
  port: number;
  logLevel: string;
  databaseUrl: string;
  databasePoolMax: number;
  databaseCaCert?: string;
  cronSecret?: string;
  sessionSecret: string;
  phoneEncryptionKey: Buffer;
  phoneChecksumKey: string;
  cookieSecure: boolean;
  signupSheet: SignupSheetConfig;
  opsLeadUpload: OpsLeadUploadConfig;
  lockTtlHours: number;
  portalBaseUrl?: string;
  mail: MailConfig;
  forgotPasswordResponseMs: number;
}
