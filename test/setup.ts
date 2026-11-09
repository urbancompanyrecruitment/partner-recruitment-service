import { fileURLToPath } from 'node:url';

process.loadEnvFile(fileURLToPath(new URL('../.env.test', import.meta.url)));

vi.mock('../src/service/admin/google.js', () => ({
  verifyGoogleCredential: vi.fn(async (credential: string) => ({ id: `google-${credential}`, email: credential, name: 'Admin User' })),
}));
