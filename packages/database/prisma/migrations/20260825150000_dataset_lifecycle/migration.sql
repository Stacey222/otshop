ALTER TABLE "datasets"
ADD CONSTRAINT "datasets_status_check"
CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));

ALTER TABLE "dataset_items"
ADD CONSTRAINT "dataset_items_position_max_check"
CHECK ("position" < 1000);

DROP INDEX "dataset_items_dataset_position_key";

ALTER TABLE "dataset_items"
ADD CONSTRAINT "dataset_items_dataset_position_key"
UNIQUE ("dataset_id", "position")
DEFERRABLE INITIALLY IMMEDIATE;
