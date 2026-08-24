# Current-state assessment

Date: 2026-08-22
Discovery scope: `D:\otshop`

## Executive summary

The workspace did not contain an application repository. It contained one user-provided archive, `tutor.zip`, with seven JPEG screenshots of a manual Shopee Android video-posting journey. There were no manifests, source files, database schemas, environment files, tests, CI/CD definitions, README, or Git metadata to preserve.

Following the Phase 0 instruction for an empty repository, a minimal monorepo shell and documentation set were initialized. No application code, Android automation, third-party API integration, or selectors were introduced.

## Inventory before initialization

| Area | Finding |
| --- | --- |
| Git | Not a Git repository; no branch or history existed |
| Root files | `tutor.zip` only |
| Archive contents | Seven JPEG screenshots; no source code or hidden application files |
| Frontend/backend | Absent |
| Package manifests | Absent |
| Database/migrations | Absent |
| Environment configuration | Absent |
| Tests | Absent |
| CI/CD | Absent |
| Documentation | Absent |

## Available development tools

| Tool | Discovery result |
| --- | --- |
| Node.js | `v22.14.0` |
| pnpm (through Corepack) | `11.22.0` |
| Python | `3.13.13` |
| Docker | Not found on `PATH` |
| FFmpeg / FFprobe | Not found on `PATH` |
| ADB | Not found on `PATH` |

PostgreSQL and Redis were not probed through live connections because no configuration or services were supplied. Their availability remains unverified.

## Screenshot evidence

The screenshots show this observed manual sequence:

1. Open the Shopee Android application.
2. Enter the `Live & Video` area.
3. Open the create-video action.
4. Select local media from the Android gallery.
5. Continue through the video editor.
6. Enter a caption and optionally open product association.
7. Search or choose a product to add.

This evidence is insufficient for automation implementation. It does not establish resource IDs, accessibility identifiers, UI hierarchy, package/activity names, account identity rules, tested Android compatibility, tested Shopee version, timing behavior, or the final publish-result state. The screenshots must not be treated as verified selectors. See `docs/research/android-workflow-observations.md`.

## Existing stack and components

There was no existing stack. The initialized shell reserves the specification's preferred boundaries:

- `apps/web` for a Next.js/TypeScript control plane;
- `apps/worker` for a Python/ADB/uiautomator2 worker;
- `packages/shared` for domain contracts and runtime schemas;
- `packages/database` for PostgreSQL/Prisma schema and migrations;
- `packages/config` for shared TypeScript tooling;
- `docs` for architecture, operations, and verified Shopee UI research.

These directories are boundaries, not completed components.

## Technical debt

There is no inherited code debt. The project starts with delivery and infrastructure risk instead:

- no executable application or test harness;
- no database, queue, or object-storage environment;
- no CI/CD pipeline;
- no identity provider or authentication design validated;
- no installed media or Android tooling on the discovery machine;
- no authorized test device inventory;
- no verified Shopee Video API capability;
- no captured UI hierarchy or versioned selector evidence;
- no documented retention, backup, or deployment target.

## Reusable material

Only the screenshots are reusable, and only as a high-level workflow reference. They can guide a future authorized UI-observation session but cannot safely drive selector implementation.

## Phase 0 open decisions

There is no existing implementation to conflict with the specification. The following choices must be resolved in Phase 1 before foundation coding:

1. Deployment topology and ownership of PostgreSQL, Redis, and object storage.
2. Authentication/session technology and initial organization bootstrap process.
3. Whether the initial queue uses PostgreSQL alone or Redis/BullMQ from day one.
4. Worker transport (request/response plus SSE versus WebSocket) and credential provisioning.
5. Media storage limits, retention, malware scanning, and backup policy.
6. Supported Windows and Android versions for the first controlled deployment.
7. How authorized operators verify the active Shopee account without collecting credentials.

Phase 1 resolved the implementation-impacting MVP choices: one central control-plane host, PostgreSQL queue without mandatory Redis, local storage behind a provider, application-local OTShop authentication, outbound-only per-workspace worker credentials, and fail-closed account verification. Retention/SLO deployment values and actual Android account-identity evidence remain later-phase inputs. See [MVP system design](system-design.md) and [Security](security.md).

## Phase 0 conclusion

The repository is a greenfield project. Proceed to Phase 1 architecture; do not begin Shopee integration or automation until its evidence and safety gates are satisfied.
