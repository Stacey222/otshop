# Implementation roadmap

This roadmap follows the required phases. Each phase is gated; later work does not begin merely because earlier code exists.

## Phase 0 — Discovery (completed)

Deliverables: repository inventory, environment inventory, screenshot assessment, clean monorepo shell, proposed architecture, and roadmap.

Exit evidence: this documentation, unchanged source archive, initialized workspace structure, and a reviewed Git diff/status.

## Phase 1 — Architecture (completed)

Create the required system, database, state-machine, Android-worker, and security documents with Mermaid diagrams and focused architecture decision records. Define trust boundaries, tenancy rules, job/device lease algorithms, outbox semantics, worker protocol, error taxonomy, storage lifecycle, deployment topology, and threat model.

Exit evidence: the authoritative documents under `docs/architecture/`, contradiction and traceability review, conservative feature flags, and the exact [Phase 2 contract](architecture/phase-2-plan.md).

## Phase 2 — Foundation

Scaffold strict Next.js/TypeScript tooling, PostgreSQL/Prisma migrations, authentication, organization/workspace membership, permission-based RBAC, structured logging, centralized errors, health/readiness endpoints, and a minimal accessible dashboard. Add CI for format, lint, typecheck, unit, API, database, and isolation tests.

Gate: clean database bootstrap, workspace-isolation tests, unauthorized-role tests, and all quality checks pass.

Implementation scope and sequencing are fixed by [the Phase 2 implementation contract](architecture/phase-2-plan.md). Phase 2 does not include Android automation, Shopee selectors, real publishing, or fabricated external APIs.

## Phase 3 — Media and datasets

Implement storage ports, safe uploads, magic-byte/MIME/size checks, SHA-256 fingerprinting, FFprobe metadata, thumbnail generation, immutable originals, dataset CRUD, bulk import, tags, duplicate detection, and bounded processing concurrency.

Slice 3.1 implements only the storage port/local adapter, bounded streaming MP4 ingest, immutable originals, SHA-256 workspace-scoped deduplication, authorization, persistence compensation, and their unit/API/PostgreSQL integration coverage. FFprobe, thumbnails, media processing, datasets, bulk import, and tags remain later gated slices.

Slice 3.2 adds only bounded FFprobe inspection, normalized existing-schema metadata, a narrow platform-neutral compatibility decision, explicit inspection lifecycle/failure semantics, database concurrency claims, and real Windows/Linux-capable process integration coverage. Thumbnails, transformations, datasets, bulk import, and tags remain later gated slices.

Gate: invalid/missing/duplicate media cases pass; source files are never overwritten; cleanup and retention are documented.

## Phase 4 — Project engine

Implement projects, reusable caption templates with constrained variables, product references, per-item mappings, retry/rate profiles, and a pre-flight readiness service. Add mock-only dry-run configuration.

Gate: template escaping, tenant authorization, configuration validation, pause/resume rules, and readiness reports are tested.

## Phase 5 — Job engine

Implement publish jobs, explicit transition guards, attempts/results/events, transactional batch creation, outbox delivery, queue port/adapters, fairness, priority, idempotency, retry classification/backoff, circuit breakers, audit trails, and `MockShopeeAdapter` scenarios.

Gate: duplicate prevention, competing claimers, cancellations, retry classes, crash recovery, fairness, and the full mock workflow pass.

## Phase 6 — Worker protocol

Create the typed Python worker and versioned, authenticated registration/heartbeat/claim/progress/result/diagnostic protocol. Add unique worker credentials, rotation/revocation, leases, compatibility checks, bounded concurrency, and sanitized logging.

Gate: protocol contract tests, offline detection, credential rejection, lease expiry, replay/idempotency, and worker restart recovery pass without ADB.

## Phase 7 — Android device layer

Install and verify Android Platform Tools in a controlled worker environment. Add USB and explicitly approved wireless ADB operations, device inventory, device facts, Shopee installation/launch checks, screenshots, UI-hierarchy capture, redaction, and diagnostics. Do not publish.

Gate: authorized-device tests pass and no diagnostic bundle contains session material or unnecessary sensitive screen content.

## Phase 8 — Shopee Screen Objects

Observe the authorized app on a dedicated test account/device. Record package/activity facts, UI hierarchy, stable selectors, fallbacks, Shopee version, Android version, worker version, and observation date in `docs/shopee/ui-map.md`. Implement versioned Screen Objects incrementally; fail closed on unknown UI.

Gate: selectors are evidence-backed; missing-selector behavior captures sanitized diagnostics and enters review without coordinate guessing.

## Phase 9 — Dry run

Execute the complete UI journey through the final review screen while disabling the final publish action in both control-plane policy and worker code. Verify device/account identity, media selection, caption entry, optional product selection, timeouts, and recovery.

Gate: repeated dry runs succeed on the recorded compatibility matrix and cannot trigger publication.

## Phase 10 — Controlled real publish

After explicit authorization, enable a layered real-publish flag for one designated test account, device, video, and operator-confirmed run. Verify result and recovery manually before attempting a small batch.

Gate: one-item evidence, audit trail, idempotency verification, rollback/stop procedure, and operator sign-off. Never scale directly to hundreds.

## Phase 11 — Scheduler and concurrency

Add immediate/specific/recurring schedules, fair workspace scheduling, multiple worker/device pairs, expiring device leases, account/workspace limits, compatible-device failover, and project-level concurrency controls.

Gate: load, starvation, competing lease, offline failover, account-binding, daylight-saving/time-zone, and recovery tests pass.

## Phase 12 — Production hardening

Add metrics/alerts, backup and restore drills, migration safeguards, worker auto-recovery, health dashboard, retention jobs, diagnostic bundles, security review, dependency scanning, performance tests, runbooks, and supported-version policy.

Gate: deployment checklist, restore test, incident drill, security findings disposition, SLO dashboards, and capacity evidence are complete.

## Cross-phase definition of done

For every slice: implementation, migration when applicable, runtime validation, error handling, permission checks, documentation, formatting, lint, typecheck, unit tests, relevant integration tests, manual verification where required, and review of the final diff. A check is reported only when actually run.
