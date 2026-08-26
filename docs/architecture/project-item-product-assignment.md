# ProjectItem AffiliateProduct assignment

Status: Phase 4 Slice 4.3 local implementation contract.

## Scope and reuse

Slice 4.3 reuses the existing `ProductReference` root and `ProjectItemProduct` join. It does not introduce a second AffiliateProduct model, external lookup, scraping, connectivity, scheduling, job, worker, Android, or publishing behavior.

An assignment is local configuration only. `ProductReference.operatorReference` and `productUrl` remain operator-supplied, unverified references and contain no credentials.

## Cardinality and identity

MVP cardinality is one primary product per ProjectItem. `ProjectItemProduct.position` is fixed to `0`, and PostgreSQL uniquely constrains `projectItemId`. The composite primary key continues to identify the exact item/product pair.

Assignments follow the stable ProjectItem identity, not its current display position. Dataset reorder therefore repositions the ProjectItem without moving its product to a different source item. Reconciliation refuses to remove a configured ProjectItem.

There is no persisted Project-level default in this slice. Bulk assignment explicitly materializes the selected product onto every ACTIVE ProjectItem, bounded by the existing 1,000-item Dataset limit. Later materialized items do not inherit a hidden default.

## Eligibility and lifecycle

Mutations require all of the following:

- the authenticated workspace owns the Project, ProjectItem, account, and ProductReference;
- the caller has `projects.write`;
- the Project is `DRAFT` and its optimistic `expectedVersion` matches;
- the ProjectItem is `ACTIVE`;
- the ProductReference is `ACTIVE`, `MANUAL`, and belongs to the Project's non-null account.

Read requires `projects.read`. Cross-workspace identifiers fail as not found. Replacement deletes the prior join and creates the new join in one serializable transaction. Removal deletes only the join; it never deletes the ProjectItem or ProductReference. Repeating the same assignment or removing an absent assignment is idempotent and does not advance the Project version.

Existing assignments prevent changing either the Project account or ProductReference account to an incompatible value. Product archival remains allowed: the historical assignment stays readable and explicitly reports the archived status, while READY validation fails closed until the configuration is repaired. New assignments to archived products are rejected.

## API contract

- `GET /api/projects/{projectId}/items/{projectItemId}/product` reads the current assignment.
- `PUT /api/projects/{projectId}/items/{projectItemId}/product` accepts `{ productId, expectedVersion }`.
- `DELETE /api/projects/{projectId}/items/{projectItemId}/product` accepts `{ expectedVersion }`.
- `POST /api/projects/{projectId}/items/product/bulk` accepts `{ productId, expectedVersion }` and applies it to all ACTIVE materialized items.

Mutation routes require same-origin requests and bounded JSON bodies. Contracts are strict, UUIDv7 identifiers are validated, and errors do not disclose whether foreign-workspace records exist.

## Concurrency and execution boundary

Assignment, replacement, removal, and bulk assignment claim the Project version inside a serializable transaction. Competing mutations with the same expected version produce one winner and a conflict for the loser. Database constraints independently prevent a second assignment or a non-zero position.

Slice 4.3 creates no PublishJob, ScheduleRun, worker command, device operation, external HTTP request, Shopee request, secret, or credential storage.
