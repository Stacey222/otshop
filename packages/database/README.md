# Database package

Owns the PostgreSQL/Prisma schema, versioned migrations, generated-client lifecycle, readiness probe, and guarded database integration tests. Consumers use the root `@otshop/database` export rather than importing Prisma internals or constructing independent clients.

## Compatibility decision

Prisma CLI and Client are both pinned to `6.19.1`. This stable line supports Node.js 22 and PostgreSQL 16 without requiring the Prisma 7 driver-adapter/configuration migration. Upgrade both packages together in a dedicated reviewed change.

UUIDv7 values are generated and validated by `@otshop/shared`, then stored in native PostgreSQL `uuid` columns. The database has no competing ID default and migration checks reject non-v7 primary identifiers.

## Commands

From the repository root:

```powershell
pnpm db:generate
pnpm db:validate
$env:DATABASE_URL = "postgresql://authorized-user:local-password@localhost:5432/otshop"
pnpm db:migrate:deploy
```

`db:migrate:deploy` requires an authorized `DATABASE_URL` and applies committed migrations only. It never uses `prisma db push`.

Database integration uses a separately provisioned disposable database:

```powershell
$env:TEST_DATABASE_URL = "postgresql://test-user:local-password@localhost:5432/otshop_test"
pnpm test:database
```

The target database or `schema` query parameter must end in `_test`. The command applies migrations, runs transactional constraint tests, and never creates, drops, or resets a database. Credentials above are illustrative local placeholders only.

## Migration and rollback discipline

Migrations are forward-only history under `prisma/migrations`. Production rollback means stopping deployment, restoring a verified backup when data rollback is required, or applying a reviewed forward corrective migration. Disposable development databases may be recreated explicitly by their owner; repository commands never drop an unknown database automatically.

The handwritten invariant migration supplements Prisma for UUIDv7 checks, partial indexes, role-scope and job-transition triggers, append-only history, and fixed role/permission seeds. Static tests detect drift between those critical values and `@otshop/shared`.
