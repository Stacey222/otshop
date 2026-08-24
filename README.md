# OTShop

OTShop is the planned control plane for authorized, human-supervised Shopee Video publishing through independently deployed Android workers. Phase 1 architecture and the Phase 2 control-plane foundation are complete. Phase 3 domain implementation has not begun.

## Safety boundary

The platform will not bypass CAPTCHA, OTP, authentication challenges, device verification, rate limits, or platform access controls. Real publishing must remain disabled by default and must not be implemented from guessed APIs or Android selectors.

## Repository layout

```text
apps/
  web/       Next.js strict-TypeScript control plane
  worker/    Reserved Python Android worker boundary
packages/
  config/    Validated environment and feature configuration
  database/  PostgreSQL/Prisma schema, migrations, client boundary, and database tests
  shared/    Runtime-validated cross-boundary contracts and generated JSON Schema
docs/
  architecture/
scripts/
```

The user-supplied `tutor.zip` is retained unchanged as research input. It contains screenshots of a manual Android workflow and is not production code.

## Start here

- [Current-state assessment](docs/architecture/current-state.md)
- [Final MVP system design](docs/architecture/system-design.md)
- [Database design](docs/architecture/database.md)
- [Security and RBAC](docs/architecture/security.md)
- [Publisher contract](docs/architecture/publisher-contract.md)
- [Job state machine](docs/architecture/job-state-machine.md)
- [Worker protocol and leases](docs/architecture/worker-protocol.md)
- [PostgreSQL job queue](docs/architecture/job-queue.md)
- [Scheduler](docs/architecture/scheduler.md)
- [Error taxonomy](docs/architecture/error-taxonomy.md)
- [Phase 2 implementation contract](docs/architecture/phase-2-plan.md)
- [Requirements traceability](docs/architecture/requirements-traceability.md)
- [Implementation roadmap](docs/implementation-roadmap.md)
- [Android workflow observations](docs/research/android-workflow-observations.md)

## Development setup

Prerequisites:

- Git 2.49 or newer;
- Node.js 22.14 or a compatible Node.js 22 release;
- pnpm 11.22 through Corepack.

Python, ADB, FFmpeg, Redis, and Android are not Phase 2 runtime dependencies. PostgreSQL 16 is required for authentication and normal authenticated application use; liveness and ordinary unit tests remain database-independent.

Install dependencies from PowerShell at the repository root:

```powershell
pnpm install
```

The application boots with safe development defaults. To customize configuration, create the ignored Next.js environment file and edit only local placeholder values:

```powershell
Copy-Item .env.example apps/web/.env.local
```

The architecture deliberately has no global `WORKER_API_SECRET`; future workers receive unique revocable credentials. All publishing and integration flags must remain disabled in this slice.

## Database development

For the web application, the ignored `apps/web/.env.local` created above supplies `DATABASE_URL`. For migration commands, set the authorized URL in the current shell; never commit it:

```powershell
$env:DATABASE_URL = "postgresql://authorized-user:local-password@localhost:5432/otshop"
```

Generate and validate the pinned Prisma client/schema:

```powershell
pnpm db:generate
pnpm db:validate
```

Apply committed migrations to an existing authorized database:

```powershell
pnpm db:migrate:deploy
```

Database integration requires an independently provisioned disposable target whose database name or schema ends in `_test`:

```powershell
$env:TEST_DATABASE_URL = "postgresql://test-user:local-password@localhost:5432/otshop_test"
pnpm test:database
```

The integration command applies all migrations and runs constraint tests. It never creates or drops a database. See [the database package guide](packages/database/README.md) for safety and rollback details.

Run the control plane:

```powershell
pnpm dev
```

Open `http://localhost:3000`. Liveness at `http://localhost:3000/api/health` never requires PostgreSQL. Readiness at `http://localhost:3000/api/ready` returns HTTP 200 with `ready` only when the configured database responds; missing or unavailable database configuration returns a sanitized HTTP 503.

## Initial super administrator

There is no public bootstrap endpoint and no default credential. Apply migrations to an authorized empty/development database, set `DATABASE_URL`, and supply the password only through a temporary process environment variable. PowerShell usage:

```powershell
$bootstrapSecret = Read-Host "Initial SUPER_ADMIN password" -AsSecureString
$bootstrapPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bootstrapSecret)
try {
  $env:OTSHOP_BOOTSTRAP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bootstrapPointer)
  pnpm auth:bootstrap -- --email "admin@example.com" --display-name "Initial administrator"
} finally {
  Remove-Item Env:OTSHOP_BOOTSTRAP_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bootstrapPointer)
}
```

The password must contain at least 12 characters with upper-case, lower-case, number, and symbol. The command succeeds only while no `SUPER_ADMIN` grant exists and transactionally creates the user, Argon2id credential, system grant, and audit record. Repeated execution fails without overwriting an administrator.

Start the app and visit `http://localhost:3000/login`. Login creates a revocable eight-hour database session. Select an active workspace at `/workspaces`; selection validates membership and rotates the session. Logout revokes the database row before clearing cookies. Authorization is server-side and uses `ROLE_PERMISSIONS`; hidden UI is never treated as access control.

## Request correlation and safe diagnostics

Application/API requests receive a server-generated UUIDv7 request ID. API responses expose it through `x-request-id`, and safe error envelopes include it as `error.requestId`. Browser-supplied IDs are replaced, and request IDs are never authorization credentials.

Pino writes structured JSON containing safe fields such as `requestId`, route, method, status, and duration. Nested passwords, passphrases, tokens, authorization values, cookies, sessions, secrets, API keys, and database URLs are redacted. Do not log raw request bodies or caught exception messages. When a user reports an error, search logs by request ID and correlate the validated workspace/user or audit context; never ask for passwords, cookies, tokens, or connection strings.

`/api/health` is dependency-free process liveness. `/api/ready` checks required database configuration/connectivity and returns only a sanitized `ready` or `unavailable` result. Authenticated pages and sensitive APIs use private/no-store caching behavior.

## Deterministic mock publisher

The publisher registry reports the local `MOCK` publisher as available and both Shopee publisher kinds as explicitly unavailable. Registration does not imply availability, capability support, feature enablement, or permission to perform real publishing.

Capability pre-flight derives requirements from the canonical request: media requires `VIDEO_UPLOAD`, a non-null caption requires `CAPTION`, and product references require `PRODUCT_ATTACHMENT`. Client-provided required-capability claims are rejected. Protected publisher operations require an active workspace and `projects.run`.

The mock supports `SUCCESS`, `RETRYABLE_FAILURE`, `NON_RETRYABLE_FAILURE`, `AUTH_REQUIRED`, `DEVICE_OFFLINE`, `UPLOAD_TIMEOUT`, and `UNKNOWN_PUBLISH_STATE`. The uncertain scenario always requires manual review and is never retryable. References use a deterministic `mock:publication:` prefix. Scenario execution is disabled in production and creates no database publish job.

Developer/test endpoints are:

```text
GET  /api/publishers
POST /api/publishers/preflight
POST /api/publishers/mock/execute
```

The POST endpoints require same-origin requests. All endpoints reuse server request IDs, safe errors, structured redacted logs, authorization, trusted workspace context, and `no-store` responses. They make no network, Shopee, Android, ADB, worker, scheduler, or real-publish call.

## Continuous integration and required merge checks

GitHub Actions runs one required Phase 2 verification pipeline for every push and pull request. It uses Node.js 22, the repository-pinned pnpm 11.22.0, locked dependency installation, and an ephemeral PostgreSQL 16 service database. No repository or production database credential is used.

The pipeline runs formatting, lint, type checking, Prisma validation, shared-schema drift checks, the complete deterministic test suite, empty-database migrations and PostgreSQL integration tests, and the production build. It also regenerates the shared contract artifact and fails if any tracked file changes. A failure means that the corresponding merge gate is not satisfied; do not merge by bypassing or excluding that check.

Run the local equivalent from PowerShell:

```powershell
pnpm install --frozen-lockfile
pnpm db:validate
pnpm schema:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
$env:TEST_DATABASE_URL = "postgresql://test-user:local-password@localhost:5432/otshop_test"
pnpm test:database
pnpm build
```

The PostgreSQL target must be disposable and its database or schema name must end in `_test`; the safety wrapper rejects other targets. `pnpm test:database` applies every committed migration to that target before running database, authentication, tenant-isolation, authorization, and publisher API integration tests. Clear the temporary shell variable when finished:

```powershell
Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
```

All listed checks are required before merging. GitHub is authoritative for the remote result; a local pass does not claim that the hosted workflow ran.

After an intentional shared-contract change, regenerate the deterministic JSON Schema artifact with `pnpm schema:generate`. Future Python/Pydantic contract models will consume that artifact; Slice 2.2 does not generate Python code.

Production-style local start after a successful build:

```powershell
pnpm start
```
