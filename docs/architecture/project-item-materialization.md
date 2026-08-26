# ProjectItem materialization foundation

Phase 4 Slice 4.2 activates the canonical `ProjectItem` as the local Project-specific configuration record for one canonical Dataset video. It introduces no publishing or external integration.

## Responsibility and timing

`DatasetItem` owns reusable Dataset membership, canonical media identity, and zero-based source ordering. `ProjectItem` owns the future Project-specific configuration boundary while retaining workspace-qualified references to its Project, DatasetItem, and MediaAsset. Materialization is allowed only while the Project and Dataset are configurable (`DRAFT` Project and `ACTIVE` Dataset). A Project cannot become `READY` until its active ProjectItems exactly match every DatasetItem, media reference, and position and every source media record remains `READY`.

Materialization does not copy or interpret caption overrides. New ProjectItems use `caption = null`, empty custom fields, `ACTIVE` local lifecycle, and no product relationships. Caption templates, hashtags, AI generation, and publisher formatting remain dormant.

## Ordering and idempotency

ProjectItem positions are derived only from DatasetItem positions. Creation time and media processing time never affect order. The position uniqueness constraint is deferrable so the entire ordered set can be reconciled atomically without transient swap conflicts.

An unchanged materialization returns the same ProjectItem identifiers and Project version with `changed = false`. A changed materialization claims the expected Project version, reconciles inside one serializable transaction, and increments the Project version once. Concurrent requests therefore converge through one winner or a safe conflict and cannot create duplicates.

## Reconciliation and data preservation

Added DatasetItems create only missing ProjectItems. Reordering updates existing ProjectItem positions and preserves their identifiers and dormant configuration. Switching a DRAFT Project to another Dataset removes old rows only when they remain pristine: active, null caption, empty custom fields, and without product or job relations. Otherwise reconciliation fails without partial changes.

The DatasetItem foreign key intentionally remains restrictive. Dataset removal transactionally prunes referencing ProjectItems only when every affected row is pristine and belongs to a DRAFT Project. Configured, archived, READY, product-linked, or job-linked ProjectItems block source deletion. This prevents future per-item configuration from being silently discarded.

## Isolation and future boundaries

All Project, Dataset, DatasetItem, MediaAsset, and ProjectItem queries and relations remain workspace-qualified. The route and service independently require `projects.write`; guessed cross-workspace Project identifiers fail closed.

`ProjectItemProduct` remains dormant. Materialization never attaches AffiliateProducts. It also creates no Schedule, ScheduleRun, PublishJob, queue record, worker assignment, Android command, Shopee request, or network call. A future caption/product slice may mutate ProjectItem configuration only behind its own acceptance gate. A future scheduler must consume only a revalidated READY Project and its exact materialized item set.
