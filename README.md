# partner-recruitment-service

Backend for the Singapore partner recruitment portal (`recruitment-portal`): partner sign-up with a primary mobile number and password, generated interview slots, admin export and verified-list upload, recruiter locks and placements. Tech design: Confluence "Partner Recruitment Portal — Backend Tech Design".

Stack: Node 22+ · TypeScript (ESM) · Fastify 5 · zod · MySQL 8 (`mysql2`) · argon2id · signed-JWT cookies (`jose`) · Vitest.

## Run it locally

```bash
nvm use 24
npm ci
cp .env.example .env          # then fill SESSION_SECRET, PHONE_ENCRYPTION_KEY, PHONE_CHECKSUM_KEY with `openssl rand -hex 32`
npm run db:local              # creates partner_recruitment + partner_recruitment_test and the `recruitment` user (needs MySQL root)
npm run migrate               # applies migrations/*.sql to DATABASE_URL
npm run seed                  # demo partners, recruiters and locks (wipes the database first; refuses in production)
npm run dev                   # http://localhost:3006, restarts on change
```

`npm run migrate:test` prepares the test database once; `npm test` then runs the integration suite against it (each test truncates the tables).

The frontend dev server (`recruitment-portal`, port 9009) proxies `/api` to port 3006, so the browser, the API and the cookies share one origin.

### MySQL on this Mac

MySQL 8.4 LTS is installed with the arm64 Homebrew and runs as a service:

```bash
/opt/homebrew/bin/brew services start mysql@8.4    # or stop / restart
/opt/homebrew/opt/mysql@8.4/bin/mysql -u root        # root has no password locally
```

Teammates with Docker can use `docker compose up -d` instead (same database, user and password as `.env.example`).

### Seeded accounts

| Role | Sign in with | Password |
|---|---|---|
| Partner | any seeded primary number, e.g. `+65 9000 0001` | `Demo123!` |
| Recruiter | `alex.morgan@brightpath.sg` or `jamie.lee@horizon.sg` | `Demo123!` |
| Admin | Google sign-in with an `urbancompany.com` / `urbanclap.com` account | — |

## API

All routes live under `/api`; bodies and responses are JSON, errors are `{ error: { code, message, details? } }` with the HTTP status from `src/common/errors/constant.ts`. Sessions are httpOnly cookies per role (`partner_session`, `recruiter_session`, `admin_session`).

| Area | Routes |
|---|---|
| Public | `GET /partner/interview-cities`, `GET /partner/interview-slots?cityKey=`, `POST /partner/sign-up`, `POST /partner/auth/login` |
| Partner | `GET /partner/auth/me`, `POST /partner/auth/logout`, `GET /partner/me`, `POST /partner/change-password` |
| Recruiter | `POST /recruiter/auth/login`, `GET /recruiter/auth/me`, `POST /recruiter/auth/logout`, `GET /recruiter/partners/available`, `GET /recruiter/locks`, `POST /recruiter/partners/:id/lock`, `GET /recruiter/partners/:id`, `POST /recruiter/partners/:id/placement`, `POST /recruiter/partners/:id/release` |
| Admin | `POST /admin/auth/google`, `GET /admin/auth/me`, `POST /admin/auth/logout`, `GET /admin/partners`, `GET /admin/partners/export.csv`, `PUT /admin/partners/:id/singapore-phone`, `POST /admin/partners/:id/reset-password`, `POST /admin/partners/:id/mark-joined`, `POST /admin/verification-imports`, `GET /admin/verification-imports/:id[/failures.csv]`, `GET /admin/slot-occupancy`, `GET|POST /admin/recruiters`, `PUT /admin/recruiters/:id/status`, `GET /admin/locks` |

## How it is built

```
migrations/            one SQL file per schema change, applied in name order and recorded in schema_migrations
scripts/local-db.sql   local database + user
src/
  app.ts               Fastify instance: cookies, rate limits, error envelope, routes under /api
  common/
    config/            env parsing (zod) → typed config
    db/                mysql2 pool (UTC session), query helpers, transactions, migration runner
    lock/              withCriticalSection(keys, work): MySQL GET_LOCK on one pooled connection
    crypto/            AES-256-GCM phone encryption + HMAC checksum, argon2id passwords
    auth/              JWT cookie sessions, login lockout rules
    clients/           provider-onboarding-service (stubbed when ONBOARDING_BASE_URL is empty)
  service/
    interview/         cities, generated hourly slots, bookings
    partner/           sign-up, login, status, state machine, lead sync
    verification/      verified-list import and fail CSV
    recruiter/         accounts, login, guard
    lock/              pool, lock, reveal, placement, release, expiry
    admin/             Google login, partner admin actions, recruiters, locks
    audit/             audit_logs writer
  workflow/            deactivateExpiredLocks (run daily: npm run workflow:deactivate-expired-locks)
  scripts/             seed
test/                  integration tests (app.inject against the test database)
```

Each module keeps enums and types in `interface.ts`, constants in `constant.ts`, SQL in `repository.ts`, rules in `usecases.ts` and HTTP handlers in `routes.ts`.

### Critical sections

Every read-decide-write runs inside `withCriticalSection(keys, work)`: the keys are taken with MySQL `GET_LOCK` on one pooled connection **before the first read**, the work (reads, decision, transaction, external call) runs on that connection, and the locks are released at the end. Keys: `phone:<checksum>` + `slot:<slotId>` + `partner:<id>` for sign-up, `partner:<id>` for lock, placement, release, Singapore-number update, verified import rows, mark joined, password reset and login counters, `recruiter:<id>` for recruiter login and status. If a lock cannot be acquired within 5 seconds the request fails with `LOCK_UNAVAILABLE` instead of running unlocked. Unique indexes (`primary_phone_checksum`, generated `active_partner_id`) remain as a safety net.

Named locks live in MySQL itself, so there is no Redis or distributed-lock-manager dependency; they work across several instances of the service as long as they share the database (true on RDS).

### Time

The MySQL session is pinned to UTC (`SET time_zone = '+00:00'` on every pooled connection) and `DATETIME(3)` columns hold UTC. Interview slots are the exception: `slot_bookings.starts_at` is the Asia/Singapore wall-clock time of the slot, and slot generation uses Asia/Singapore regardless of the server's zone.

## Database in production

Target: **Amazon RDS for MySQL 8.4** (8.0 also works; the schema uses nothing newer than 8.0). Checklist:

1. **Instance.** Multi-AZ, private subnets only, security group open to the service's ECS tasks (port 3306). Start small (`db.t4g.medium`); storage autoscaling on.
2. **Parameter group.** `time_zone = UTC`, `character_set_server = utf8mb4`, `collation_server = utf8mb4_0900_ai_ci`. The service also sets the session zone, so this is belt and braces.
3. **Users.** The app connects as a dedicated user with `SELECT, INSERT, UPDATE, DELETE` on `partner_recruitment.*` only. Migrations run as a separate user with DDL rights. Never the master user.
4. **Secrets.** `DATABASE_URL`, `SESSION_SECRET`, `PHONE_ENCRYPTION_KEY`, `PHONE_CHECKSUM_KEY` come from AWS Secrets Manager into the task's environment. Rotating `PHONE_ENCRYPTION_KEY` requires re-encrypting the phone columns; the checksum key must never change (it is the lookup key).
5. **Migrations.** `npm run migrate` is a release step that runs **before** the new task definition goes live (a one-off ECS task or a CI job with the DDL credentials). MySQL DDL is not transactional, so keep each migration file small and additive (add column, add index); never rewrite an applied file. The runner takes `GET_LOCK('partner_recruitment_migrations')`, so two deploys cannot migrate at once.
6. **Backups.** Automated backups with 7–35 days of point-in-time recovery; a manual snapshot before any migration that touches existing rows.
7. **Observability.** Enhanced Monitoring + Performance Insights; alarms on CPU, free storage, connections and replica lag if a read replica is added. Pool size per task is 10 (`POOL_CONNECTION_LIMIT`); keep `max_connections` ≥ tasks × 10 + headroom.
8. **Daily job.** Schedule `npm run workflow:deactivate-expired-locks` (EventBridge → ECS scheduled task) once a day. It is idempotent and needs no lock.
9. **Local parity.** `docker-compose.yml` runs the same MySQL 8.4 image with `utf8mb4` and UTC, so a schema that works locally works on RDS.

## Environment variables

See `.env.example`. `ONBOARDING_BASE_URL` empty = stub lead creation and approval (local default); set it, `ONBOARDING_CLIENT_ID` and the category / city / source values to call `provider-onboarding-service` for real. `COOKIE_SECURE=true` in any environment served over https.
