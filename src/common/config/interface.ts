export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export interface OnboardingConfig {
  baseUrl?: string;
  clientId: string;
  categoryKey: string;
  cityKey: string;
  sourceType: string;
}

export interface Config {
  nodeEnv: NodeEnvironment;
  port: number;
  logLevel: string;
  databaseUrl: string;
  sessionSecret: string;
  phoneEncryptionKey: Buffer;
  phoneChecksumKey: string;
  cookieSecure: boolean;
  googleClientId: string;
  adminEmailDomains: string[];
  onboarding: OnboardingConfig;
  lockTtlHours: number;
  slotCapacity: number;
}
