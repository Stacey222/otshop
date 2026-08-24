# Phase 2 implementation contract

Status: Phase 2 complete; Slices 2.1 through 2.7 completed and exit-gated on 2026-08-24

## Objective

Deliver a runnable, tested foundation for the control plane and mock publishing path. Phase 2 stops before media processing, production queue workers, Android control, Shopee selectors, official Shopee integration, or real publishing.

## Fixed scope

Phase 2 includes only:

- complete pnpm monorepo tooling;
- Next.js strict-TypeScript application and accessible shell/dashboard;
- PostgreSQL/Prisma package with initial migrations;
- shared runtime schemas, enums, permissions, error codes, and publisher contract;
- application-local authentication foundation;
- organizations, workspaces, membership, and server-side RBAC foundation;
- deterministic `MockPublisher` and registry;
- structured/redacted logging and centralized errors;
- `/health` and `/ready` endpoints;
- unit, contract, API, permission, and PostgreSQL integration test infrastructure;
- CI checks and development/setup documentation.

`ENABLE_SHOPEE_ANDROID`, `ENABLE_SHOPEE_OFFICIAL_API`, `ENABLE_REAL_PUBLISH`, `ENABLE_SCHEDULER`, `ENABLE_WORKER_PROTOCOL`, and `ALLOW_REAL_PUBLISH` remain false.

## Explicit exclusions

- ADB or uiautomator2 installation and code;
- Android package names, activities, selectors, UI hierarchy, or coordinate taps;
- Shopee endpoints, payloads, authentication, or permissions;
- real publishing or final-publish UI controls;
- FFmpeg/FFprobe processing, thumbnails, or production media upload;
- active worker claiming/leases and scheduler loops beyond schema/port contracts;
- Redis/BullMQ;
- S3 deployment adapter;
- reports, bulk operations, or real-time dashboard beyond the foundation shell.

## Delivery sequence

### Slice 2.1 - Tooling and skeleton (completed)

Create root scripts for `format`, `lint`, `typecheck`, `test`, and relevant integration tests. Scaffold `apps/web`, typed package entry points, and Python worker contract-test skeleton. Pin dependencies and commit lockfiles. Add environment validation with conservative defaults.

Acceptance:

- fresh install succeeds with documented Node/pnpm/Python versions;
- strict TypeScript builds with no `any` exceptions;
- formatter, lint, typecheck, and empty/smoke test suites pass;
- no Phase 2 process requires Redis, FFmpeg, or ADB.

Implementation evidence is the executable `apps/web` workspace, `packages/config`, `packages/shared`, root quality scripts, pinned lockfile, and the verified commands documented in `README.md`. Database, authentication, publisher, worker, and scheduler implementations were not started.

### Slice 2.2 - Shared contracts (completed)

Implement runtime-validated IDs, role/permission enums, publisher capability/error contracts, job-state enum and transition table, feature flags, and safe API error envelope in `packages/shared`. Export JSON Schema/OpenAPI fragments for Python contract tests.

Acceptance:

- unknown publisher capabilities parse as unsupported;
- invalid transitions fail closed;
- environment flags default false and invalid values fail startup;
- TypeScript/Zod and the committed worker-facing JSON Schema artifact agree byte-for-byte; future Python/Pydantic models consume that artifact.

Implementation evidence is the root-only `@otshop/shared` export surface, UUIDv7-branded identifiers, exact Phase 1 role/permission and job-transition mappings, platform-neutral publisher schemas, safe API error envelope, integer worker protocol version, deterministic Draft 2020-12 JSON Schema artifact, and schema-drift tests. No database, authentication, worker networking, Shopee integration, Android automation, or real publishing was added.

### Slice 2.3 - Database foundation (completed)

Implement the Phase 1 schema in coherent migrations, starting with identity/tenancy, worker/device records, project/media placeholders required by foreign keys, publishing records, leases, events/audits/outbox, and partial indexes. Add database reset/seed commands for development and migration verification on an empty PostgreSQL database.

Acceptance:

- migrations apply from zero and rollback strategy is documented;
- composite foreign keys reject cross-workspace references;
- idempotency, open-session, active-job-lease, and active-device-lease uniqueness are database tested;
- no manual schema mutation exists outside migrations.

Implementation evidence is the pinned Prisma package/client boundary, complete Phase 1 relational schema, four ordered migrations, PostgreSQL-only UUIDv7/check/trigger/partial-index controls, canonical role/permission seeds, guarded `_test` database commands, transactional constraint integration tests, and sanitized `/api/ready` database probe. The migrations were applied from zero to an isolated PostgreSQL 16 database and all database tests passed. Authentication behavior, worker networking, scheduler execution, Android/Shopee integration, Redis, and real publishing were not implemented.

### Slice 2.4 - Authentication and RBAC (completed)

Implement user credential hashing, secure database sessions, login/logout, one-time super-admin bootstrap, workspace selection, permission service, and scoped repository APIs. Build minimal login and workspace pages without exposing raw IDs in normal views.

Acceptance:

- login/session rotation/revocation tests pass;
- every role permission allow/deny case passes;
- cross-workspace reads and writes fail at application and constraint layers;
- sensitive admin mutations create audit logs transactionally.

Implementation evidence is centralized Argon2id hashing/upgrade detection, SHA-256-hashed 256-bit database sessions, secure cookie and strict-origin handling, rotation/revocation/logout services, one-time CLI bootstrap, minimum active/suspended/revoked lifecycle contracts, canonical shared RBAC guards, workspace-qualified membership repositories, seven auth audit actions, minimal login/workspace/dashboard UI, exhaustive unit/API/security tests, and disposable-PostgreSQL authentication/tenant integration tests. No worker, scheduler, Android, Shopee, Redis, or publishing implementation was added.

### Slice 2.5 - Application shell and health (completed)

Create the required navigation shell and a basic dashboard showing honest empty-state data. Implement `/health`, `/ready`, centralized error rendering, request IDs, structured logs, and redaction.

Acceptance:

- liveness does not depend on PostgreSQL;
- readiness fails safely when required configuration/database is unavailable;
- operator errors are human readable and server errors expose no stack trace;
- logs pass secret/header redaction tests.

Implementation evidence is the reusable authenticated shell, trusted workspace summary, independent dashboard leaf guard, honest unavailable business-module states, UUIDv7 ingress correlation, centralized API logging/error conversion, recursive sensitive-key redaction, safe page error states, reviewed liveness/readiness contracts, private/no-store sensitive responses, and tested baseline CSP/frame/MIME/referrer/permissions headers. No domain CRUD, worker, scheduler, publisher execution, Android, ADB, Shopee, Redis, or real publishing implementation was added.

### Slice 2.6 - MockPublisher vertical slice (completed)

Implement publisher registry, capability pre-flight, deterministic mock scenarios, and one authorized application/API use case that exercises mock connection/capability/publish behavior without Android or real external calls. Persisting the complete production job engine remains Phase 5; Phase 2 may use a test harness or minimal draft record only if needed to prove contract wiring.

Acceptance:

- each mandated scenario is deterministic;
- official/Android publisher lookup returns feature unavailable and makes no network call;
- unsupported capability blocks before adapter invocation;
- timeout-after-submit maps to manual review semantics;
- no route or UI can set real publish mode.

Implementation evidence is the canonical publisher port, fail-closed registry, explicit unavailable real-publisher descriptors, deterministic seven-scenario `MockPublisher`, stable synthetic references, server-derived capability pre-flight, `projects.run` application guard, trusted workspace/request canonicalization, non-production mock execution API, safe publisher summaries/logs, and dashboard availability panel. Unit and disposable-PostgreSQL API tests prove unavailable/unknown publishers cannot execute, uncertainty is never retryable, client capability claims are rejected, cross-workspace/missing-permission requests fail, and no publish-job row is created.

### Slice 2.7 - CI, documentation, and review (completed)

Add CI for install, format check, lint, typecheck, unit, API, permission, schema, and PostgreSQL integration tests. Update setup/development documentation and review the complete diff for scope creep.

Acceptance:

- all checks pass from a clean checkout with PostgreSQL service;
- secret scanning finds no credentials;
- `tutor.zip` remains untracked and unchanged;
- Phase 3 work has not begun.

Implementation evidence is the single GitHub Actions Phase 2 workflow using Node.js 22, pinned pnpm 11.22.0, frozen-lockfile installation, an isolated PostgreSQL 16 service database, every required static/test/build gate, generated-contract drift detection, and a final clean-diff check. The final invariant, dependency, scope-creep, secret, and bug-hunt reviews found no blocking inconsistency: MockPublisher remains the only operational publisher, dangerous flags remain false, no future integration executable was introduced, and `tutor.zip` remains untracked with its expected SHA-256.

## Required initial pages

Phase 2 implements `/login`, `/dashboard`, `/workspaces`, `/settings`, and `/admin/users` only to the extent required for authentication/workspace/RBAC foundation. Other required routes may render permission-aware `Not implemented` placeholders only if navigation coherence requires them; placeholders must not claim functionality.

## Required test groups

- shared schema and state-transition unit tests;
- publisher capability and deterministic mock tests;
- authentication/session API tests;
- permission matrix tests;
- workspace repository isolation tests;
- migration and database-constraint tests;
- health/readiness tests;
- logging/redaction tests;
- TypeScript/Python protocol fixture contract tests.

No test may require or execute a real Shopee publication. `ALLOW_REAL_PUBLISH=false` is asserted in test startup.

## Phase 2 definition of done

Phase 2 is complete only when the implementation exists, committed migrations apply to a clean PostgreSQL database, format/lint/typecheck/tests pass, permissions and isolation are verified, errors and logs are safe, documentation is current, and the diff contains no Android automation, Shopee selectors, fabricated APIs, or real-publish path.

## Phase 2 exit decision

Phase 2 is internally consistent and approved to proceed. Its complete local gate passes from locked dependencies through clean PostgreSQL migrations, integration tests, and production build. No known technical debt blocks Phase 3; the explicitly deferred security hardening and external-integration work remains outside this phase.

## Exact recommended next action

Start Phase 3 Slice 3.1 with the storage boundary and safe immutable media-ingest foundation: define the storage port, local development adapter, upload limits, streaming SHA-256 fingerprinting, magic-byte/MIME validation, workspace isolation, and tests for invalid, missing, oversized, duplicate, and cross-workspace inputs. Do not begin dataset CRUD, FFmpeg/FFprobe processing, thumbnails, project workflows, job execution, worker networking, scheduler execution, Android automation, Shopee integration, Redis, or real publishing in that first slice.
