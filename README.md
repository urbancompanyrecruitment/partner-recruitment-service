# partner-recruitment-service

Backend for the Singapore partner recruitment portal (`recruitment-portal`): partner sign-up with a unique primary mobile number and a first and last name (partners sign in with primary mobile + last name, the way an airline booking is opened with a reference and a last name; no email, no password), interview slots from the `interview_slots` table that a signed-up partner can reschedule, in-app partner notifications, a Google Sheet row per sign-up, admin accounts with roles, verified-list and hub-list uploads, recruiter self sign-up with admin approval, recruiters registering partners themselves, aggregators per recruiter, three-day recruiter locks, admin tagging and placements. Tech design: Confluence "Partner Recruitment Portal — Backend Tech Design".

Stack: Node 22+ · TypeScript (ESM) · Fastify 5 · zod · PostgreSQL 17 (`pg`) · argon2id · signed-JWT cookies (`jose`) · Vitest.

## Run it locally

```bash
nvm use 24
npm ci
cp .env.example .env          # then fill SESSION_SECRET, PHONE_ENCRYPTION_KEY, PHONE_CHECKSUM_KEY with `openssl rand -hex 32`
npm run db:local              # creates partner_recruitment + partner_recruitment_test and the `recruitment` user (needs a local Postgres superuser, see below)
npm run migrate               # applies migrations/*.sql to DATABASE_URL
npm run seed                  # demo admins, partners, recruiters and locks (wipes those tables first, keeps interview_slots; refuses in production)
npm run dev                   # http://localhost:3006, restarts on change
```

`npm run migrate:test` prepares the test database once; `npm test` then runs the integration suite against it (each test truncates the tables).

The frontend dev server (`recruitment-portal`, port 9009) proxies `/api` to port 3006, so the browser, the API and the cookies share one origin.

### Postgres on this Mac

PostgreSQL 17 is installed with the arm64 Homebrew and runs as a service:

```bash
/opt/homebrew/bin/brew services start postgresql@17    # or stop / restart
/opt/homebrew/opt/postgresql@17/bin/psql -d postgres     # your macOS user is the local superuser, no password
```

`npm run db:local` calls `psql`, so put `/opt/homebrew/opt/postgresql@17/bin` on your `PATH` first.

Teammates with Docker can use `docker compose up -d` instead (same database, user and password as `.env.example`).

### Seeded accounts

| Role | Sign in with | Password |
|---|---|---|
| Partner | any seeded primary mobile and that partner's last name, e.g. `+65 9000 0001` + `Aung` (see `src/scripts/seedData.ts`) | none |
| Recruiter | `alex.morgan@brightpath.sg` or `jamie.lee@horizon.sg` (active), `priya.nair@swiftstaff.sg` (waiting for approval) | `Demo123!` |
| Admin | `admin@example.com` (super admin) or `ops@example.com` (admin) | `Demo123!` |

### Admin accounts

Admins sign in with an email and a password held by this service (table `admins`, argon2id hash). There is no Google sign-in: a Google domain check would let every Urban Company employee in.

- **Roles.** `super_admin` can do everything an `admin` can and also create, suspend, reactivate and reset other admins (`/admin/admins`, the "Admin accounts" page). Nobody can change their own status.
- **First super admin.** Created from the command line by an engineer with database access, once per environment:

  ```bash
  npm run admin:create -- name@urbancompany.com "Full Name" super_admin
  ```

  The command prints a one-time temporary password. Share it over a private channel; the admin changes it after the first sign-in ("Change password" in the header).
- **Everyone else.** A super admin creates the account in the dashboard and shares the temporary password shown once. Keep two super admins (the engineering owner and the business owner) so one can reset the other.

### Sign-up sheet

Every sign-up is appended to a Google Sheet: all submitted details, the interview slot and the recruiter who registered the partner (when one did). A later reschedule does not change the row. The service posts the row to an Apps Script web app that lives in the sheet (`scripts/google-sheet-webhook.gs`), authenticated with a shared secret. The service sends the secret over https; the sheet stores only its SHA-256, so the secret itself lives in the service's environment and nowhere else.

Setup, once per environment, in the Google account that owns the sheet:

1. Create a Google Sheet. Open Extensions > Apps Script and paste `scripts/google-sheet-webhook.gs` over the default code.
2. Generate the secret (`openssl rand -hex 32`) and keep it for `SIGNUP_SHEET_WEBHOOK_SECRET`. In Project Settings > Script properties, add `WEBHOOK_SECRET_SHA256` with the SHA-256 of that secret in hex: `printf '%s' "<secret>" | shasum -a 256`.
3. Deploy > New deployment > Web app, with "Execute as: Me" and "Who has access: Anyone". Google asks the account to authorise the script for its spreadsheets.
4. Put the web app URL in `SIGNUP_SHEET_WEBHOOK_URL` and the secret in `SIGNUP_SHEET_WEBHOOK_SECRET`, then restart the service.

The script writes a header row on first use, stores every cell as text so `+65...` numbers keep their plus sign, and appends to a tab named `Sign-ups`. After changing the script, deploy a new version of the same deployment so the URL stays the same.

- `SIGNUP_SHEET_WEBHOOK_URL` empty = no sheet (local default). Set it and `SIGNUP_SHEET_WEBHOOK_SECRET` to switch it on.
- The call runs after the sign-up is saved and never fails it. `partners.sheet_synced_at` records delivery; `npm run sheet:sync` sends every row that has not been delivered yet (run it after an outage, or on a schedule).
- The sheet holds phone numbers in plain text, so share it only with the people who run recruitment.

## API

All routes live under `/api`; bodies and responses are JSON, errors are `{ error: { code, message, details? } }` with the HTTP status from `src/common/errors/constant.ts`. Sessions are httpOnly cookies per role (`partner_session`, `recruiter_session`, `admin_session`).

| Area | Routes |
|---|---|
| Public | `GET /partner/interview-cities?country=`, `GET /partner/interview-slots?cityKey=`, `POST /partner/sign-up`, `POST /partner/auth/login`, `POST /recruiter/sign-up` |
| Partner | `GET /partner/auth/me`, `POST /partner/auth/logout`, `GET /partner/me`, `POST /partner/reschedule`, `GET /partner/notifications`, `POST /partner/notifications/read` |
| Recruiter (any signed-in account) | `POST /recruiter/auth/login`, `GET /recruiter/auth/me`, `POST /recruiter/auth/logout`, `POST /recruiter/change-password` |
| Recruiter (approved only, otherwise `RECRUITER_PENDING_APPROVAL`) | `GET /recruiter/partners/available`, `POST /recruiter/partners` (register a partner), `GET /recruiter/partners/registered`, `GET /recruiter/aggregators`, `GET /recruiter/locks`, `POST /recruiter/partners/:id/lock`, `GET /recruiter/partners/:id`, `POST /recruiter/partners/:id/placement`, `POST /recruiter/partners/:id/release` |
| Admin | `POST /admin/auth/login`, `GET /admin/auth/me`, `POST /admin/auth/logout`, `POST /admin/change-password`, `GET /admin/partners`, `GET /admin/partners/export.csv`, `GET /admin/partners/ops-lead-upload.csv`, `PUT /admin/partners/:id/singapore-phone`, `POST /admin/partners/:id/assign-recruiter`, `POST /admin/partners/:id/mark-joined`, `POST /admin/verification-imports`, `GET /admin/verification-imports/:id[/failures.csv]`, `POST /admin/hub-imports`, `GET /admin/slot-occupancy`, `GET /admin/interview-centres`, `POST /admin/slot-imports`, `GET|POST /admin/recruiters`, `PUT /admin/recruiters/:id/status`, `POST /admin/recruiters/:id/reset-password`, `POST /admin/recruiters/:id/aggregators`, `DELETE /admin/recruiters/:id/aggregators/:aggregatorId`, `GET /admin/locks` |
| Super admin | `GET|POST /admin/admins`, `PUT /admin/admins/:id/status`, `POST /admin/admins/:id/reset-password` |

Uploads are JSON, parsed from the CSV in the browser: `POST /admin/verification-imports` takes `{ fileName, rows: [{ primaryPhone, verified }] }` (`verified` true marks the partner verified, false marks them `verification_failed`, which is final) and `POST /admin/hub-imports` takes `{ fileName, rows: [{ primaryPhone, hubName }] }`. `GET /admin/recruiters` returns each recruiter with `locksAcquired`, `placementsSubmitted` and `aggregators`. `POST /partner/auth/login` takes `{ primaryPhone, lastName }`; `POST /partner/reschedule` takes `{ interviewCity, slotId }`; `POST /recruiter/partners/:id/placement` takes `{ aggregatorId, startDate }`; `POST /admin/partners/:id/assign-recruiter` takes `{ recruiterId }`.

`GET /admin/partners/ops-lead-upload.csv` is the file admins upload on the ops dashboard at `/lead/bulkAdd` to create the Urban Company leads. It takes the same filters as `export.csv` and returns a plain CSV (no byte order mark, quotes only where needed) with the columns `name, phone, city_key, category_key, source_type, experiment_name`. Only partners with a valid Singapore number are included, with `phone` as the 8 digits without `+65`; partners in `verification_failed` are left out; at most 10,000 rows (the limit of the ops page). The last four columns come from the `OPS_LEAD_UPLOAD_*` variables, and the route answers `409 OPS_UPLOAD_NOT_CONFIGURED` until `OPS_LEAD_UPLOAD_CATEGORY_KEY` is set. No Urban Company lead or provider id comes back to this service; both systems match on the Singapore mobile number.

## How it is built

```
migrations/            one SQL file per schema change, applied in name order and recorded in schema_migrations
scripts/local-db.sql   local database + user
scripts/google-sheet-webhook.gs   Apps Script that receives sign-up rows in the Google Sheet
src/
  buildApp.ts          Fastify instance: cookies, rate limits, error envelope, routes under /api
  common/
    config/            env parsing (zod) → typed config
    db/                pg pool (UTC session), query helpers, transactions, migration runner
    lock/              withCriticalSection(keys, work): Postgres advisory locks on one pooled connection
    crypto/            AES-256-GCM phone encryption + HMAC checksum, argon2id passwords
    auth/              JWT cookie sessions, login lockout rules
    clients/           sign-up sheet webhook
  service/
    interview/         cities and slots from interview_slots, bookings
    partner/           sign-up (by the partner or by a recruiter), last-name login, status, reschedule, state machine, lead sync and approval, sheet sync
    notification/      partner notifications (verified, placement)
    aggregator/        aggregators an admin adds to a recruiter
    verification/      verified-list import (verified true / false) and fail CSV
    hub/               hub-list import
    recruiter/         self sign-up, accounts, status changes, login, guards
    lock/              pool, lock, admin tagging, registration lock, reveal, placement, release, expiry
    admin/             admin accounts and login, partner admin actions, recruiters with stats, locks
    audit/             audit_logs writer
  workflow/            deactivateExpiredLocks (run daily: npm run workflow:deactivate-expired-locks)
  scripts/             seed, createAdmin (npm run admin:create), syncSheet (npm run sheet:sync)
test/                  integration tests (app.inject against the test database)
```

Each module keeps enums and types in `interface.ts`, constants in `constant.ts`, SQL in `repository.ts`, rules in `usecases.ts` and HTTP handlers in `routes.ts`.

### Critical sections

Every read-decide-write runs inside `withCriticalSection(keys, work)`: the keys are taken as Postgres session advisory locks (`pg_advisory_lock(hashtextextended(key, 0))`) on one pooled connection **before the first read**, the work (reads, decision, transaction, external call) runs on that connection, and the locks are released at the end. Keys: `phone:<checksum>` + `slot:<slotId>` + `partner:<id>` for sign-up, `partner:<id>` for lock, placement, release, Singapore-number update, verified import rows, hub import rows, mark joined, password reset and login counters, `recruiter:<id>` for recruiter login, status, password change and password reset, `admin:<id>` for admin login, status and passwords. If a lock cannot be acquired within 5 seconds (`lock_timeout`, set only while the keys are taken) the request fails with `LOCK_UNAVAILABLE` instead of running unlocked. Every lock of the session is released with `pg_advisory_unlock_all()` before the connection goes back to the pool; a connection that cannot be cleaned is destroyed. Unique indexes (`primary_phone_checksum`, `email_checksum`, and the partial unique index on `recruiter_locks (partner_id) WHERE state = 'active'`) remain as a safety net.

A placement or a release is accepted only from the recruiter holding the partner's **active** lock: inside the `partner:<id>` section the service loads the row with `state = 'active'`, checks that its `locked_by` and that recruiter's email match the signed-in recruiter, and checks that `lock_release_at` is still in the future. Anything else is refused (`NOT_LOCK_OWNER` for another recruiter, `LOCK_EXPIRED` when the lock is inactive, expired, released or already placed), and the placement `UPDATE` itself only matches an active, unexpired row. A saved placement cannot be edited through the recruiter API.

Locks come from three places, recorded in `recruiter_locks.origin`: `recruiter` (the recruiter opened the profile), `admin` (an admin tagged the partner to the recruiter, `POST /admin/partners/:id/assign-recruiter`, only for a verified partner with no live lock and an active recruiter) and `registration`. The first two last `LOCK_TTL_HOURS` (72 = three days). A `registration` lock has `lock_release_at = NULL` and never expires: when the verified upload verifies a partner whose `registered_by_recruiter_id` is set and that recruiter is still active, the lock for that recruiter is created in the same transaction. It ends only with a placement or a release. A placement names one of the recruiter's own aggregators (`recruiter_aggregators`, managed by admins); the aggregator name is copied to `employer_name` so history survives a removal.

A partner in `signed_up` can move their booking with `POST /partner/reschedule` whether or not the booked slot has passed; the new slot must be offered, have a free seat and belong to a city of the partner's country. The partner gets a row in `partner_notifications` when they are verified and when a placement is saved (aggregator name and start date); `GET /partner/notifications` lists them with the unread count.

Advisory locks live in Postgres itself, so there is no Redis or distributed-lock-manager dependency; they work across several instances of the service as long as they share the database (true on RDS). They belong to the database session, so the service must reach Postgres directly or through a pooler in session mode: PgBouncer in transaction mode and RDS Proxy multiplexing would hand the lock to another request.

### Partner data at rest

`partners.primary_phone_enc` and `singapore_phone_enc` are AES-256-GCM ciphertext (`PHONE_ENCRYPTION_KEY`); lookups and uniqueness use the HMAC column `primary_phone_checksum` (`PHONE_CHECKSUM_KEY`). Partners have no password: they sign in with the primary mobile and `partners.last_name` (compared without case, ten wrong attempts lock the sign-in for fifteen minutes). That is as strong as an airline booking lookup and no stronger: anyone who knows both values can open the status page and reschedule the interview. The columns `email_enc`, `email_checksum` and `password_hash` remain in the table for rows created before the last-name sign-in and are no longer read or written. Passwords of recruiters and admins are argon2id hashes. Recruiter and admin emails are stored in plain text because they are work logins that the dashboard lists and searches.

### Interview slots

`interview_slots` has one row per city and daily start time: `country`, `city_key`, `city_name`, `centre`, `address`, `instructions`, `time_zone`, `start_time`, `end_time`, `capacity`, `is_active`. The first migration seeded placeholder cities. Migration 0002 switches every one of them off except Yangon, gives Yangon its real centre details and adds the Singapore Interview Centre, so partners are offered exactly the two valid centres, each with hourly slots from 08:00 to 18:00 and four seats. A partner in Singapore or Myanmar therefore has one interview centre and only picks the time; a partner in another country chooses between the two. Bookable slots are these rows for today and the next two days in the city's time zone, future start times only; `slot_bookings.slot_id` points at the row that was booked. To stop offering a slot set `is_active = FALSE`; no deploy is needed.

New slots come from the admin upload `POST /admin/slot-imports` (the "Upload: interview slots" card on the Partners tab): a CSV with `centre`, `start_time`, `end_time` and `capacity`. Both times are 24-hour times in the local time of that centre (Singapore time for `singapore`, Myanmar time for `yangon`), and `end_time` must be later than `start_time`. `centre` must be one of the valid interview centres, a static list in `src/service/interview/constant.ts` (`INTERVIEW_CENTRES`, also served by `GET /admin/interview-centres`):

| `centre` value | Centre | Address |
|---|---|---|
| `singapore` | Singapore Interview Centre | 33 Maude Road #02-01, Singapore 208344 |
| `yangon` | Yangon Interview Centre | Ye Tagon Tower (Pang Hlaing Tower), Pann Hlaing St, Yangon, Myanmar |

The key or the centre name is accepted, in any letter case. A row with any other centre is not created (`unknown_centre`); a bad start time (`invalid_time`), a missing or not-later end time (`invalid_end_time`), a capacity outside 1 to 200 and a repeated centre and start time are reported the same way. A row for a centre and start time that already exists replaces its end time and capacity and switches it on again. Country, city, address and time zone always come from the list, never from the file, and every slot of that city is brought in line with the list on upload. Adding a centre means adding it to the list and deploying.

`GET /partner/interview-cities?country=Singapore|Myanmar` returns that country's cities; `country=Others` or no country returns every city. Sign-up refuses an interview city outside the partner's country unless the country is Others.

### Partner and recruiter states

Partner: `signed_up` → `verified` → `placed` → `joined`, or `signed_up` → `verification_failed` (terminal: no lead approval, no Singapore-number change, no hub, never shown to recruiters). Verification no longer needs a Singapore number: the partner's lead record (a local reference only; the service calls no Urban Company system) is approved at verification when it exists, otherwise when the Singapore number is added later.

Recruiter: self sign-up creates `pending`; an admin moves it to `active` or `rejected`; `active` ⇄ `suspended`; `rejected` → `active`. Accounts created by an admin start `active`. A pending recruiter can sign in and change their password but every other recruiter route answers `RECRUITER_PENDING_APPROVAL`; suspended and rejected recruiters cannot sign in.

### Time

Every Postgres session is pinned to UTC (`-c TimeZone=UTC` in the connection options) and `TIMESTAMP(3)` columns hold UTC; the SQL uses `LOCALTIMESTAMP(3)` for "now". The driver returns timestamps, dates and times as text so nothing is shifted to the zone of the server, and `Date` parameters are written as UTC. Interview slots are the exception: `slot_bookings.starts_at` is the wall-clock time of the slot in the city's own time zone (`interview_slots.time_zone`), whatever the server's zone.

## Database in production

Target: **Amazon RDS for PostgreSQL 17** (the schema and the SQL use nothing newer than 14). Checklist:

1. **Instance.** Multi-AZ, private subnets only, security group open to the service's ECS tasks (port 5432). Start small (`db.t4g.medium`); storage autoscaling on.
2. **Connection.** `DATABASE_URL=postgres://user:password@host:5432/partner_recruitment?sslmode=require`. Connect to the instance endpoint, not through RDS Proxy or a transaction-mode pooler (see Critical sections). The service sets the session time zone itself, so no parameter group change is needed.
3. **Users.** The app connects as a dedicated role with `SELECT, INSERT, UPDATE, DELETE` on the tables and `USAGE` on the sequences of `partner_recruitment` only. Migrations run as a separate role that owns the schema. Never the master user.
4. **Secrets.** `DATABASE_URL`, `SESSION_SECRET`, `PHONE_ENCRYPTION_KEY`, `PHONE_CHECKSUM_KEY`, `SIGNUP_SHEET_WEBHOOK_URL`, `SIGNUP_SHEET_WEBHOOK_SECRET` come from AWS Secrets Manager into the task's environment. Rotating `PHONE_ENCRYPTION_KEY` requires re-encrypting the phone columns; the checksum key must never change (it is the lookup key).
5. **Migrations.** `npm run migrate` is a release step that runs **before** the new task definition goes live (a one-off ECS task or a CI job with the DDL credentials). Each migration file runs in one transaction, so a failed file leaves nothing behind; never rewrite an applied file. The runner takes an advisory lock, so two deploys cannot migrate at once.
6. **Backups.** Automated backups with 7–35 days of point-in-time recovery; a manual snapshot before any migration that touches existing rows.
7. **Observability.** Enhanced Monitoring + Performance Insights; alarms on CPU, free storage, connections and replica lag if a read replica is added. Pool size per task is 10 (`DATABASE_POOL_MAX`); keep `max_connections` ≥ tasks × 10 + headroom (each critical section holds one connection for its whole request).
8. **Daily job.** Schedule `npm run workflow:deactivate-expired-locks` (EventBridge → ECS scheduled task) once a day. It is idempotent and needs no lock. `npm run sheet:sync` can run on the same schedule to deliver sign-up rows the sheet missed.
9. **First admin.** After the first migration, run `npm run admin:create -- <email> "<name>" super_admin` as a one-off task and hand the temporary password to that person.
10. **Local parity.** `docker-compose.yml` runs the same Postgres 17 image, so a schema that works locally works on RDS.

## Deploying on Vercel with Supabase

The service runs on Vercel as one function: Vercel detects Fastify from `src/index.ts`: it is the only entry-point name under `src/`, and it must import `fastify` itself, which is why it creates the instance and hands it to the builder in `src/buildApp.ts`. In the project settings the application preset is **Fastify** (Vercel suggests Container because of the Dockerfile). Nothing changes locally.

1. **Database URL.** Use the Supabase **session pooler** connection string (`...pooler.supabase.com:5432`). The transaction pooler (port 6543) breaks the advisory locks (see Critical sections), and the direct `db.<ref>.supabase.co` host is IPv6 only, which Vercel cannot reach.
2. **Certificate.** Paste the Supabase CA certificate (Database settings > SSL configuration) into `DATABASE_CA_CERT`. The service then verifies the server against it and ignores any `sslmode` in the URL.
3. **Pool.** `DATABASE_POOL_MAX=3`. Each running copy of the function opens its own pool and the session pooler caps the total number of clients, so keep this small. Not 1: a critical section holds one connection while its work may need another.
4. **Other variables.** `NODE_ENV=production`, `COOKIE_SECURE=true`, fresh `SESSION_SECRET`, `PHONE_ENCRYPTION_KEY`, `PHONE_CHECKSUM_KEY`, and `CRON_SECRET`.
5. **Schema and first admin.** Run `npm run migrate` and `npm run admin:create` from a laptop with `DATABASE_URL` (and `DATABASE_CA_CERT`) pointing at Supabase. Deployments do not migrate.
6. **Scheduled clean-up.** `vercel.json` asks Vercel Cron to call `GET /api/cron/deactivate-expired-locks` every hour (UTC, production deployment only). Vercel sends `Authorization: Bearer <CRON_SECRET>`; the endpoint answers 401 to anything else, and to everything while `CRON_SECRET` is empty.
7. **Region.** Set the function region (Project > Settings > Functions) to the region of the Supabase database.
8. **Same origin.** The portal project forwards `/api/*` to this project (its `vercel.json`), so the browser only ever talks to the portal's address and the session cookies stay first-party.

Rate limits are counted per running copy (in memory), so they are looser than on a single server.

## Environment variables

See `.env.example`. `DATABASE_POOL_MAX` (default 10) is the pool size of each running copy. `DATABASE_CA_CERT` is the PEM certificate of the database's certificate authority; empty = TLS is governed by `DATABASE_URL` alone. `CRON_SECRET` protects the scheduled clean-up endpoint; empty = the endpoint refuses every call. `COOKIE_SECURE=true` in any environment served over https. `SIGNUP_SHEET_WEBHOOK_URL` empty = no sign-up sheet. `OPS_LEAD_UPLOAD_CATEGORY_KEY` is the Urban Company provider category written into the ops lead upload file; empty = that download is refused. `OPS_LEAD_UPLOAD_CITY_KEY` (default `city_singapore_v2`), `OPS_LEAD_UPLOAD_SOURCE_TYPE` (`third_party` or `offline_activity`) and `OPS_LEAD_UPLOAD_EXPERIMENT_NAME` (lowercase letters, digits and underscores) fill the other fixed columns.
