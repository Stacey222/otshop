# Project configuration foundation

Phase 3 Slice 3.6 introduces a workspace-owned configuration boundary between prepared media and future publication planning. A Dataset answers which canonical videos are available; a Project references one Dataset and records how that collection may eventually be used. It never copies Dataset items or media.

## Lifecycle

Projects use only `DRAFT`, `READY`, and `ARCHIVED`.

- `DRAFT` is editable configuration. It may intentionally be incomplete.
- `READY` means the current local configuration passed this slice's structural validation. It is locked, but it does not mean Shopee authentication or actual publish readiness.
- `ARCHIVED` remains readable and is immutable. Restore and hard delete are deferred.

The `DRAFT` to `READY` transition requires an active Dataset with at least one item backed by a `READY` MediaAsset and a daily target. It creates no `ProjectItem`, `Schedule`, `ScheduleRun`, `PublishJob`, queue entry, or worker work.

## Daily target and posting window

`dailyTarget` is optional while drafting and bounded from 1 through 50. It is future scheduler input only; no timestamps or jobs are generated.

A posting window is optional and atomic: start time, end time, and canonical IANA timezone are either all present or all absent. Times use strict `HH:mm` local wall-clock format, and the end must be later than the start. Overnight windows, posting days, holidays, DST execution policy, cron, and calendar exceptions are deferred.

## Dataset, account, and product boundaries

The Dataset relation is mandatory, workspace-qualified, and must point to an active canonical Dataset. READY rechecks that the Dataset remains active and contains at least one item backed by a `READY` MediaAsset. Thumbnails are not required and media is not reinspected.

The existing `ShopeeAccount` relation is an optional local future-target reference. It does not assert authentication or verification and stores no cookie, password, OTP, or token. Account management and account-required publish readiness are deferred.

The existing `ProjectItem`, `ProductReference`, and `ProjectItemProduct` models remain dormant. Slice 3.6 does not snapshot Dataset items, resolve affiliate URLs, attach products, or call Shopee. Caption templates and AI captions are also deferred; the dormant project caption field retains a safe Dataset-override default only for schema compatibility.

## API, isolation, and concurrency

Protected APIs create/list/get/update projects and perform READY/archive transitions. Reads require `projects.read`; writes require `projects.write` at both route and service boundaries. JSON bodies are capped at 16 KiB, listing defaults to 25 and is capped at 100, and keyset cursors are bounded and validated before repository work.

Workspace identity comes only from `AuthenticatedContext.workspaceId`. Every lookup and mutation is workspace-qualified, while composite foreign keys prevent cross-workspace Dataset and account relations. Guessed foreign UUIDs fail without revealing their existence.

Every mutation requires `expectedVersion`. Database compare-and-set updates choose one winner for concurrent update, archive, or READY operations; no process-local mutex is authoritative.

## Known limitations and scheduler handoff

There is no UI, posting-day calendar, account authentication, product assignment, ProjectItem materialization, scheduler execution, job creation, worker networking, Android/ADB operation, Shopee API or app automation, retry policy editing, media tagging, transformation, or publishing. A future separately approved scheduling slice may consume only READY project configuration and must revalidate account/product and Dataset readiness before creating durable work.
