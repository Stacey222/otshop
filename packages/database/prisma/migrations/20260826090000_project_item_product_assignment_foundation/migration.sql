DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "project_item_products"
    GROUP BY "project_item_id"
    HAVING COUNT(*) > 1 OR BOOL_OR("position" <> 0)
  ) THEN
    RAISE EXCEPTION 'ProjectItemProduct rows must be reduced to one primary assignment before this migration';
  END IF;
END
$$;

DROP INDEX "project_item_products_position_key";

ALTER TABLE "project_item_products"
  ADD CONSTRAINT "project_item_products_project_item_key"
    UNIQUE ("project_item_id"),
  ADD CONSTRAINT "project_item_products_primary_position_check"
    CHECK ("position" = 0);
