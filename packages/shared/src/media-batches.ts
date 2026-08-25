import { z } from "zod";

import { DatasetNameSchema } from "./datasets";

export const MEDIA_BATCH_MAX_FILES = 25;
export const MEDIA_BATCH_MAX_TOTAL_BYTES = 1_073_741_824;
export const MEDIA_BATCH_MAX_CONCURRENCY = 2;
export const MEDIA_BATCH_DEFAULT_RESULT_PAGE_SIZE = 25;
export const MEDIA_BATCH_MAX_RESULT_PAGE_SIZE = 100;
export const MEDIA_BATCH_MAX_METADATA_BYTES = 16_384;

export const mediaImportBatchStatuses = [
  "CREATED",
  "PROCESSING",
  "FINALIZING",
  "COMPLETED",
  "COMPLETED_WITH_ERRORS",
  "FAILED",
] as const;
export const MediaImportBatchStatusSchema = z.enum(mediaImportBatchStatuses);
export type MediaImportBatchStatus = z.infer<typeof MediaImportBatchStatusSchema>;

export const mediaImportBatchItemOutcomes = [
  "UPLOADING",
  "SUCCESS",
  "REUSED",
  "REJECTED",
  "FAILED",
] as const;
export const MediaImportBatchItemOutcomeSchema = z.enum(mediaImportBatchItemOutcomes);
export type MediaImportBatchItemOutcome = z.infer<typeof MediaImportBatchItemOutcomeSchema>;

export const MediaImportBatchCreateRequestSchema = z
  .object({
    name: DatasetNameSchema,
  })
  .strict();

export const MediaImportBatchVersionRequestSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
  })
  .strict();

export const MediaImportBatchInputIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(MEDIA_BATCH_MAX_FILES - 1);

export type MediaImportBatchCreateRequest = Readonly<
  z.infer<typeof MediaImportBatchCreateRequestSchema>
>;
