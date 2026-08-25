UPDATE "shopee_accounts"
SET "status" = 'ACTIVE'
WHERE "status" IN ('UNVERIFIED', 'CONFIGURED');

UPDATE "shopee_accounts"
SET "status" = 'ARCHIVED'
WHERE "status" NOT IN ('ACTIVE', 'ARCHIVED');

UPDATE "product_references"
SET "status" = 'ACTIVE'
WHERE "status" IN ('UNVERIFIED', 'CONFIGURED');

UPDATE "product_references"
SET "status" = 'ARCHIVED'
WHERE "status" NOT IN ('ACTIVE', 'ARCHIVED');

ALTER TABLE "shopee_accounts"
  ADD CONSTRAINT "shopee_accounts_status_check"
    CHECK ("status" IN ('ACTIVE', 'ARCHIVED')),
  ADD CONSTRAINT "shopee_accounts_display_name_check"
    CHECK (char_length("display_name") BETWEEN 1 AND 120),
  ADD CONSTRAINT "shopee_accounts_shop_name_check"
    CHECK ("shop_name" IS NULL OR char_length("shop_name") BETWEEN 1 AND 120),
  ADD CONSTRAINT "shopee_accounts_operator_reference_check"
    CHECK ("operator_reference" IS NULL OR char_length("operator_reference") BETWEEN 1 AND 120);

ALTER TABLE "product_references"
  ADD CONSTRAINT "product_references_status_check"
    CHECK ("status" IN ('ACTIVE', 'ARCHIVED')),
  ADD CONSTRAINT "product_references_display_name_check"
    CHECK (char_length("display_name") BETWEEN 1 AND 160),
  ADD CONSTRAINT "product_references_operator_reference_check"
    CHECK ("operator_reference" IS NULL OR char_length("operator_reference") BETWEEN 1 AND 200),
  ADD CONSTRAINT "product_references_product_url_check"
    CHECK ("product_url" IS NULL OR char_length("product_url") BETWEEN 1 AND 2048),
  ADD CONSTRAINT "product_references_sku_check"
    CHECK ("sku" IS NULL OR char_length("sku") BETWEEN 1 AND 120),
  ADD CONSTRAINT "product_references_local_reference_check"
    CHECK ("product_url" IS NOT NULL OR "operator_reference" IS NOT NULL);

CREATE INDEX "shopee_accounts_workspace_status_created_idx"
ON "shopee_accounts"("workspace_id", "status", "created_at");

CREATE INDEX "product_references_workspace_status_created_idx"
ON "product_references"("workspace_id", "status", "created_at");
