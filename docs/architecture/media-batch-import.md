# Bounded folder and batch media import

Phase 3 Slice 3.5 maps the future “select a folder” experience to a workspace-owned batch domain. A browser or trusted desktop companion may enumerate a user-selected folder and submit its files, but the control plane never accepts or scans an arbitrary server filesystem path. Folder UX is not server-path access.

## Staged streaming protocol

The protected Node.js API uses four operations:

- POST /api/media/batches creates a batch and its dedicated active Dataset from bounded display metadata.
- POST /api/media/batches/{batchId}/items streams exactly one MP4 request with an explicit input index, batch version, display filename, MIME type, and required content length.
- POST /api/media/batches/{batchId}/finalize reconciles terminal items and assembles eligible media into the Dataset.
- GET /api/media/batches/{batchId} returns a bounded result page and summary.

No multipart parser, formData(), arrayBuffer(), recursive scanner, path parameter, or whole-batch media buffer is used. Each body remains an AsyncIterable of Uint8Array chunks passed to the canonical MediaIngestService.

## Limits and concurrency

Hard defaults are 25 files, 1 GiB aggregate batch bytes, 256 MiB per individual media through the existing ingest limit, 16 KiB metadata requests, and two simultaneous uploads per batch. Environment settings may reduce the file, aggregate-byte, and concurrency limits but cannot raise their compiled ceilings.

Each item reserves its declared bytes with an optimistic database version claim before streaming. Actual chunks are counted independently and the request is rejected as soon as observed bytes exceed the declaration. Completion releases unused reservation and persists all bytes actually observed, including the first rejected over-limit chunk; that can place the recorded total above the ceiling and thereby blocks every later upload. Database-backed active_uploads prevents process-local concurrency controls from being authoritative.

## Lifecycle and outcomes

Batches use CREATED, PROCESSING, FINALIZING, COMPLETED, COMPLETED_WITH_ERRORS, and FAILED. Items use UPLOADING, SUCCESS, REUSED, REJECTED, and FAILED. A malformed or policy-incompatible video is a permanent item rejection. Storage, inspection-system, or persistence problems are failures. Successful immutable MediaAssets are never rolled back because another input fails.

Ingest immediately invokes the existing inspection service. Thumbnail generation remains separate and is not required. Only READY SUCCESS or REUSED items are Dataset-eligible.

## Duplicates and deterministic ordering

Canonical workspace-scoped SHA-256 deduplication remains owned by MediaIngestService. Repeated bytes reuse one MediaAsset and are reported as REUSED. Finalization de-duplicates media membership because a Dataset may contain a MediaAsset only once.

Every item has a unique server-generated UUID and a unique caller-declared inputIndex from 0 through 24. Completion timing never establishes order. Finalization reads terminal items by input index and appends each first occurrence of a READY MediaAsset through DatasetService. Failed inputs compact naturally while preserving relative order. Repeated copies report the Dataset position of their first occurrence.

## Finalization and reconciliation

Finalization uses a persisted optimistic claim and refuses to run while any upload is active. Completed finalization is idempotent even when called with an old version. A retry after an ambiguous Dataset assembly failure validates that existing Dataset membership is an exact prefix of the intended batch order, then continues. Foreign or externally reordered membership fails closed as a batch conflict. Dataset assembly is intentionally reconciled rather than cross-service atomic; canonical media and successful Dataset items are preserved across system failures.

## Ownership and authorization

Workspace identity comes only from AuthenticatedContext.workspaceId. All repository reads, mutations, and composite foreign keys are workspace-qualified. Batch operations require canonical media.upload, datasets.read, and datasets.write permissions at the service boundary. Guessed cross-workspace batch, Dataset, or MediaAsset identifiers fail without revealing private existence.

## Safe reporting and logging

Results are paginated and bounded. Responses expose only batch identifiers, the dedicated Dataset identifier, bounded display filenames, input indexes, outcomes, safe error codes, byte counts, and Dataset positions. Logs contain operational identifiers, input index, outcome, duration/byte counts where relevant, and never local paths, storage keys, bytes, probe diagnostics, database details, or credentials.

## Limitations

There is no cancellation, automatic retry, browser folder picker, filesystem watcher, recursive scan, spreadsheet import, thumbnail fan-out, Project, account/product assignment, daily target, scheduler, worker, Android, ADB, Shopee automation, or publishing. A persistence failure after Dataset creation but before batch creation can leave an empty active Dataset; it is an explicitly documented ambiguous setup outcome pending a future administrative reconciliation mechanism.
