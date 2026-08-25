CREATE TABLE "media_import_batches" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "dataset_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "total_bytes" BIGINT NOT NULL DEFAULT 0,
  "reserved_bytes" BIGINT NOT NULL DEFAULT 0,
  "active_uploads" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "media_import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_import_batches_status_check"
    CHECK ("status" IN ('CREATED', 'PROCESSING', 'FINALIZING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED')),
  CONSTRAINT "media_import_batches_total_bytes_check"
    CHECK ("total_bytes" >= 0),
  CONSTRAINT "media_import_batches_reserved_bytes_check"
    CHECK ("reserved_bytes" >= 0 AND "reserved_bytes" <= 1073741824),
  CONSTRAINT "media_import_batches_active_uploads_check"
    CHECK ("active_uploads" >= 0 AND "active_uploads" <= 2),
  CONSTRAINT "media_import_batches_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "media_import_batch_items" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "media_asset_id" UUID,
  "input_index" INTEGER NOT NULL,
  "display_filename" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "declared_bytes" BIGINT NOT NULL,
  "size_bytes" BIGINT,
  "error_code" TEXT,
  "dataset_position" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "media_import_batch_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_import_batch_items_input_index_check"
    CHECK ("input_index" >= 0 AND "input_index" < 25),
  CONSTRAINT "media_import_batch_items_outcome_check"
    CHECK ("outcome" IN ('UPLOADING', 'SUCCESS', 'REUSED', 'REJECTED', 'FAILED')),
  CONSTRAINT "media_import_batch_items_declared_bytes_check"
    CHECK ("declared_bytes" >= 0),
  CONSTRAINT "media_import_batch_items_size_bytes_check"
    CHECK ("size_bytes" IS NULL OR "size_bytes" >= 0),
  CONSTRAINT "media_import_batch_items_dataset_position_check"
    CHECK ("dataset_position" IS NULL OR ("dataset_position" >= 0 AND "dataset_position" < 25))
);

CREATE UNIQUE INDEX "media_import_batches_workspace_id_id_key"
ON "media_import_batches"("workspace_id", "id");
CREATE INDEX "media_import_batches_workspace_created_idx"
ON "media_import_batches"("workspace_id", "created_at");
CREATE INDEX "media_import_batches_dataset_idx"
ON "media_import_batches"("workspace_id", "dataset_id");
CREATE INDEX "media_import_batches_creator_idx"
ON "media_import_batches"("created_by_user_id");

CREATE UNIQUE INDEX "media_import_batch_items_input_key"
ON "media_import_batch_items"("batch_id", "input_index");
CREATE UNIQUE INDEX "media_import_batch_items_workspace_id_id_key"
ON "media_import_batch_items"("workspace_id", "id");
CREATE INDEX "media_import_batch_items_media_idx"
ON "media_import_batch_items"("workspace_id", "media_asset_id");
CREATE INDEX "media_import_batch_items_outcome_idx"
ON "media_import_batch_items"("batch_id", "outcome", "input_index");

ALTER TABLE "media_import_batches"
ADD CONSTRAINT "media_import_batches_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_import_batches"
ADD CONSTRAINT "media_import_batches_workspace_dataset_fkey"
FOREIGN KEY ("workspace_id", "dataset_id") REFERENCES "datasets"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_import_batches"
ADD CONSTRAINT "media_import_batches_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "media_import_batch_items"
ADD CONSTRAINT "media_import_batch_items_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_import_batch_items"
ADD CONSTRAINT "media_import_batch_items_workspace_batch_fkey"
FOREIGN KEY ("workspace_id", "batch_id") REFERENCES "media_import_batches"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_import_batch_items"
ADD CONSTRAINT "media_import_batch_items_workspace_media_fkey"
FOREIGN KEY ("workspace_id", "media_asset_id") REFERENCES "media_assets"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
