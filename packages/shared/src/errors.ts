import { z } from "zod";

import { RequestIdSchema, type RequestId } from "./identifiers";

export const errorCategories = ["RETRYABLE", "NON_RETRYABLE", "MANUAL_REVIEW_REQUIRED"] as const;

export const ErrorCategorySchema = z.enum(errorCategories);

export type ErrorCategory = (typeof errorCategories)[number];

export type SafeMetadataValue = boolean | null | number | string;

export type SafeMetadata = Readonly<Record<string, SafeMetadataValue>>;

export const SafeMetadataValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const SafeMetadataSchema = z.record(z.string(), SafeMetadataValueSchema);

export const ErrorCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/);

export const SafeMessageSchema = z.string().min(1).max(500);

export interface ApplicationErrorShape {
  readonly category: ErrorCategory;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly safeMetadata: SafeMetadata;
}

export const ApplicationErrorShapeSchema = z
  .object({
    category: ErrorCategorySchema,
    code: ErrorCodeSchema,
    message: SafeMessageSchema,
    retryable: z.boolean(),
    safeMetadata: SafeMetadataSchema,
  })
  .strict();

export const ValidationErrorDetailSchema = z
  .object({
    code: ErrorCodeSchema,
    field: z.string().min(1).max(200),
    message: SafeMessageSchema,
  })
  .strict();

export type ValidationErrorDetail = Readonly<z.infer<typeof ValidationErrorDetailSchema>>;

export const ApiErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        category: ErrorCategorySchema,
        code: ErrorCodeSchema,
        details: z.array(ValidationErrorDetailSchema).optional(),
        message: SafeMessageSchema,
        requestId: RequestIdSchema,
        retryable: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type ApiErrorEnvelope = Readonly<z.infer<typeof ApiErrorEnvelopeSchema>>;

export function createApiErrorEnvelope(
  error: ApplicationErrorShape,
  requestId: RequestId,
  details?: readonly ValidationErrorDetail[],
): ApiErrorEnvelope {
  return ApiErrorEnvelopeSchema.parse({
    error: {
      category: error.category,
      code: error.code,
      ...(details === undefined ? {} : { details }),
      message: error.message,
      requestId,
      retryable: error.retryable,
    },
  });
}
