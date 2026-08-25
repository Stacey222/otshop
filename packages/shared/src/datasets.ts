import { z } from "zod";

import { DatasetItemIdSchema, MediaAssetIdSchema } from "./identifiers";

export const datasetStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const DatasetStatusSchema = z.enum(datasetStatuses);
export type DatasetStatus = z.infer<typeof DatasetStatusSchema>;

export const DATASET_DEFAULT_PAGE_SIZE = 25;
export const DATASET_MAX_PAGE_SIZE = 100;
export const DATASET_MAX_ITEMS = 1_000;
export const DATASET_NAME_MAX_LENGTH = 120;
export const DATASET_DESCRIPTION_MAX_LENGTH = 2_000;
export const DATASET_CAPTION_MAX_LENGTH = 2_200;

const withoutUnsafeControls = <T extends z.ZodString>(schema: T) =>
  schema.refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value));

export const DatasetNameSchema = withoutUnsafeControls(
  z.string().trim().min(1).max(DATASET_NAME_MAX_LENGTH),
);

export const DatasetDescriptionSchema = withoutUnsafeControls(
  z.string().trim().max(DATASET_DESCRIPTION_MAX_LENGTH),
)
  .nullable()
  .transform((value) => (value === null || value.length === 0 ? null : value));

export const DatasetCaptionSchema = withoutUnsafeControls(
  z.string().trim().max(DATASET_CAPTION_MAX_LENGTH),
)
  .nullable()
  .transform((value) => (value === null || value.length === 0 ? null : value));

export const DatasetVersionSchema = z.number().int().min(1);

export const DatasetCreateRequestSchema = z
  .object({
    name: DatasetNameSchema,
    description: DatasetDescriptionSchema.optional(),
  })
  .strict();

export const DatasetUpdateRequestSchema = z
  .object({
    expectedVersion: DatasetVersionSchema,
    name: DatasetNameSchema.optional(),
    description: DatasetDescriptionSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.name !== undefined || Object.hasOwn(value, "description"),
    "At least one editable field is required",
  );

export const DatasetVersionRequestSchema = z
  .object({ expectedVersion: DatasetVersionSchema })
  .strict();

export const DatasetItemAddRequestSchema = z
  .object({
    expectedVersion: DatasetVersionSchema,
    mediaAssetId: MediaAssetIdSchema,
    captionOverride: DatasetCaptionSchema.optional(),
  })
  .strict();

export const DatasetItemUpdateRequestSchema = z
  .object({
    expectedVersion: DatasetVersionSchema,
    captionOverride: DatasetCaptionSchema,
  })
  .strict();

export const DatasetReorderRequestSchema = z
  .object({
    expectedVersion: DatasetVersionSchema,
    itemIds: z.array(DatasetItemIdSchema).max(DATASET_MAX_ITEMS),
  })
  .strict();

export type DatasetCreateRequest = Readonly<z.infer<typeof DatasetCreateRequestSchema>>;
export type DatasetUpdateRequest = Readonly<z.infer<typeof DatasetUpdateRequestSchema>>;
export type DatasetVersionRequest = Readonly<z.infer<typeof DatasetVersionRequestSchema>>;
export type DatasetItemAddRequest = Readonly<z.infer<typeof DatasetItemAddRequestSchema>>;
export type DatasetItemUpdateRequest = Readonly<z.infer<typeof DatasetItemUpdateRequestSchema>>;
export type DatasetReorderRequest = Readonly<z.infer<typeof DatasetReorderRequestSchema>>;
