# Dataset foundation

Phase 3 Slice 3.4 adds the first organization layer above inspected media. A dataset is a workspace-owned ordered collection of references to existing `READY` `MediaAsset` rows. It owns no original or thumbnail bytes and performs no storage operation.

## Ownership, authorization, and lifecycle

Workspace identity always comes from `AuthenticatedContext.workspaceId`; request bodies cannot select it. Reads require the existing `datasets.read` permission and mutations require `datasets.write` at both the route and application-service boundaries. Every repository operation includes the workspace ID, while composite database foreign keys prevent a dataset item from joining a dataset or media asset from another workspace.

The lifecycle is exactly `ACTIVE` or `ARCHIVED`, enforced by a versioned database check constraint. Archive preserves metadata and membership. Archived datasets remain readable, but metadata update, item add/update/remove, reorder, and repeated archive are rejected. Restore and hard deletion are deferred.

## Items and ordering

Only same-workspace media whose canonical inspection status is `READY` can be appended. Thumbnail presence is not required. The existing unique `(dataset_id, media_asset_id)` constraint prevents duplicate membership, and removing an item deletes only the relation.

Positions are contiguous and zero-based. Add appends at the next position. Removal compacts the remaining order. Reorder is a full replacement containing every existing dataset-item UUID exactly once. The position uniqueness constraint is deferred only inside the ordering transaction, allowing one set-based statement to assign the final `0..n-1` order without weakening the database's `0..999` position bounds.

`Dataset.version` is the single optimistic token for metadata and every membership mutation. The client supplies `expectedVersion`; a successful operation increments the version. Competing updates, reorders, archive, or item changes cannot both commit from the same version. No process-local lock is authoritative.

## API and validation

The protected API provides dataset create/list/read/update/archive, item append/update/remove, and full reorder. Dataset list and embedded item list use opaque keyset cursors, default to 25 records, and allow at most 100. Dataset listing returns active records by default; `includeArchived=true` opts into history.

Names, descriptions, captions, JSON request bodies, page sizes, cursor lengths, and reorder length are bounded. A dataset holds at most 1,000 items, enforced by application policy and a database position ceiling. Caption text is plain user-owned text; there is no AI or template behavior. The existing `custom_fields` column remains unchanged and is not writable through Slice 3.4 APIs, avoiding an unbounded schema-free contract.

Responses expose safe dataset metadata and media summaries only. Logs contain IDs, operation, result, and duration, never description/caption content, custom fields, filenames, storage keys, media bytes, or credentials.

## Limitations

There is no restore, hard delete, bulk/spreadsheet import, tags, project workflow, media deletion, physical file operation, UI, caption generation, publishing job, scheduler, worker, Android, Shopee integration, or real publishing in this slice.
