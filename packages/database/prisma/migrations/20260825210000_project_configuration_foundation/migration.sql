ALTER TABLE "projects"
  ALTER COLUMN "account_id" DROP NOT NULL,
  ALTER COLUMN "publisher_kind" DROP NOT NULL,
  ALTER COLUMN "caption_mode" SET DEFAULT 'DATASET_OVERRIDE',
  ALTER COLUMN "minimum_interval_seconds" SET DEFAULT 0,
  ALTER COLUMN "max_attempts" SET DEFAULT 1,
  ALTER COLUMN "retry_policy" SET DEFAULT '{}'::jsonb;

ALTER TABLE "projects" RENAME COLUMN "daily_limit" TO "daily_target";

ALTER TABLE "projects"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "posting_timezone" TEXT,
  ADD COLUMN "posting_window_start" VARCHAR(5),
  ADD COLUMN "posting_window_end" VARCHAR(5);

ALTER TABLE "projects" DROP CONSTRAINT "projects_limits_check";

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_status_check"
    CHECK ("status" IN ('DRAFT', 'READY', 'ARCHIVED')),
  ADD CONSTRAINT "projects_name_check"
    CHECK (char_length("name") BETWEEN 1 AND 120),
  ADD CONSTRAINT "projects_description_check"
    CHECK ("description" IS NULL OR char_length("description") <= 2000),
  ADD CONSTRAINT "projects_daily_target_check"
    CHECK ("daily_target" IS NULL OR "daily_target" BETWEEN 1 AND 50),
  ADD CONSTRAINT "projects_version_check"
    CHECK ("version" >= 1),
  ADD CONSTRAINT "projects_execution_defaults_check"
    CHECK ("minimum_interval_seconds" >= 0 AND "max_attempts" >= 1),
  ADD CONSTRAINT "projects_posting_window_check"
    CHECK (
      ("posting_timezone" IS NULL AND "posting_window_start" IS NULL AND "posting_window_end" IS NULL)
      OR (
        "posting_timezone" IS NOT NULL
        AND char_length("posting_timezone") BETWEEN 1 AND 255
        AND "posting_window_start" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
        AND "posting_window_end" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
        AND "posting_window_start" < "posting_window_end"
      )
    );

CREATE INDEX "projects_workspace_status_created_idx"
ON "projects"("workspace_id", "status", "created_at");
