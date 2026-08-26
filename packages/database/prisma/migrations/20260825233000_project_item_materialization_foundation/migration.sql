-- Existing ProjectItem rows predate the controlled lifecycle. Preserve them fail-closed.
UPDATE "project_items"
SET "status" = 'ARCHIVED'
WHERE "status" <> 'ACTIVE';

ALTER TABLE "project_items"
ADD CONSTRAINT "project_items_status_check"
CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));

-- Reconciliation updates the whole ordered set atomically. Deferral permits safe swaps.
DROP INDEX "project_items_project_position_key";

ALTER TABLE "project_items"
ADD CONSTRAINT "project_items_project_position_key"
UNIQUE ("project_id", "position")
DEFERRABLE INITIALLY IMMEDIATE;
