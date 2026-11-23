import { randomUUID } from 'node:crypto';
import { pool } from '../common/db/index.js';
import { logger } from '../common/logger.js';
import { AdminRole, CLI_CREATOR, createAdmin } from '../service/admin/index.js';

const [email, name, role = AdminRole.SuperAdmin] = process.argv.slice(2);

const USAGE = 'Usage: npm run admin:create -- <email> "<full name>" [super_admin|admin]';

const run = async (): Promise<void> => {
  if (!email || !name || !Object.values(AdminRole).includes(role as AdminRole)) throw new Error(USAGE);

  const created = await createAdmin({ email: email.trim().toLowerCase(), name: name.trim(), role: role as AdminRole }, CLI_CREATOR, `cli-${randomUUID()}`);

  process.stdout.write(
    [
      `Admin created: ${created.admin.email} (${created.admin.role})`,
      `Temporary password: ${created.temporaryPassword}`,
      'Share it over a private channel. The admin should change it after the first sign-in.',
      '',
    ].join('\n'),
  );
};

run()
  .then(async () => {
    await pool.end();

    process.exit(0);
  })
  .catch(async (error: Error) => {
    logger.error({ method: 'createAdminCli', message: 'Could not create the admin', error: error?.message || error?.stack });

    await pool.end();

    process.exit(1);
  });
