# Shopee account and affiliate product configuration

Phase 4 Slice 4.1 exposes the existing `ShopeeAccount` and `ProductReference` models as local, workspace-owned configuration. `ProductReference` is the canonical persistence model behind the AffiliateProduct API. Neither record establishes connectivity to Shopee.

## Local-only account lifecycle

A ShopeeAccount is `ACTIVE` or `ARCHIVED`. ACTIVE means only that the local record may be selected by new configuration. ARCHIVED records remain readable and immutable. Existing Projects retain their historical reference, but new Project and AffiliateProduct assignment rejects an archived account.

The API accepts a bounded display name, optional operator-supplied handle, and two-letter country code. Legacy `shopName`, device-binding, and verification columns remain dormant and are not written by this slice. There is no login or connect endpoint. Passwords, cookies, sessions, OTPs, access tokens, refresh tokens, device secrets, and browser profiles are neither accepted nor stored.

## Local-only affiliate products

An AffiliateProduct is stored in the canonical `ProductReference` table and belongs to one same-workspace ACTIVE ShopeeAccount. It has an `ACTIVE` or `ARCHIVED` lifecycle, bounded display name, and at least one operator-supplied product URL or identifier. `source` is always `MANUAL`; metadata and SKU remain dormant.

URL validation is deliberately syntactic. It accepts only bounded HTTPS URLs on `shopee.co.id` or its subdomains, without embedded credentials, ports, or fragments. The server never fetches, follows, scrapes, resolves, or verifies the URL. A stored URL remains unverified user input and is not proof of product validity, ownership, or affiliate attribution.

## Isolation, authorization, and concurrency

Workspace identity comes only from `AuthenticatedContext.workspaceId`. Repository reads and writes are workspace-qualified, while existing composite foreign keys prevent cross-workspace account, Project, and product relationships. Guessed foreign UUIDs fail closed.

Account reads use `accounts.read`; account mutations use `accounts.manage`. AffiliateProduct reads use `projects.read`; mutations use `projects.write`. Route and service authorization are independent. Lists use opaque keyset cursors, default to 25, and allow at most 100 records. JSON mutation bodies are capped at 16 KiB.

Every mutation requires `expectedVersion`. Serializable transactions and database compare-and-set updates choose one winner for concurrent update/archive operations. Archived records cannot mutate and there is no hard delete or restore.

## Project and future assignment boundary

Projects may select only a same-workspace ACTIVE local ShopeeAccount. Archiving an account does not silently change an existing Project or its lifecycle. Account selection does not imply authentication or publish readiness.

Project-level default product assignment is deferred because the existing canonical schema models products through `ProjectItemProduct`, not directly on Project. The intended future hierarchy is a Project default product with an optional ProjectItem override, persisted through the existing workspace-qualified `ProjectItem` and `ProjectItemProduct` relationship after ProjectItem materialization is separately approved.

There is no product assignment engine, ProjectItem materialization, external synchronization, scheduler execution, PublishJob creation, worker networking, Android/ADB activity, Shopee login, or publishing in this slice. Future Android verification must independently establish account/session state and product attachment capability before durable work is created.
