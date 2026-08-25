ALTER TABLE "media_assets"
ADD COLUMN "thumbnail_generation_started_at" TIMESTAMPTZ(3);

ALTER TABLE "media_assets"
ADD CONSTRAINT "media_assets_thumbnail_lifecycle_check"
CHECK (
  ("thumbnail_key" IS NULL OR ("status" = 'READY' AND "thumbnail_generation_started_at" IS NULL))
  AND
  ("thumbnail_generation_started_at" IS NULL OR ("status" = 'READY' AND "thumbnail_key" IS NULL))
);
