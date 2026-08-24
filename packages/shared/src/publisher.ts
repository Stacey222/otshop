import { z } from "zod";

import {
  ErrorCategorySchema,
  ErrorCodeSchema,
  SafeMessageSchema,
  SafeMetadataSchema,
} from "./errors";
import {
  MediaAssetIdSchema,
  ProductReferenceIdSchema,
  PublishAttemptIdSchema,
  PublishJobIdSchema,
  RequestIdSchema,
  ShopeeAccountIdSchema,
  WorkspaceIdSchema,
} from "./identifiers";

export const publisherCapabilityNames = [
  "VIDEO_UPLOAD",
  "CAPTION",
  "PRODUCT_ATTACHMENT",
  "STATUS_CHECK",
  "CANCEL",
] as const;

export const PublisherCapabilitySchema = z.enum(publisherCapabilityNames);
export type PublisherCapability = z.infer<typeof PublisherCapabilitySchema>;

export const capabilitySupportValues = ["SUPPORTED", "UNSUPPORTED"] as const;
export const CapabilitySupportSchema = z.enum(capabilitySupportValues);
export type CapabilitySupport = z.infer<typeof CapabilitySupportSchema>;

const unsupportedCapabilities = (): Record<PublisherCapability, CapabilitySupport> => ({
  VIDEO_UPLOAD: "UNSUPPORTED",
  CAPTION: "UNSUPPORTED",
  PRODUCT_ATTACHMENT: "UNSUPPORTED",
  STATUS_CHECK: "UNSUPPORTED",
  CANCEL: "UNSUPPORTED",
});

export const PublisherCapabilitiesSchema = z
  .object({
    VIDEO_UPLOAD: CapabilitySupportSchema,
    CAPTION: CapabilitySupportSchema,
    PRODUCT_ATTACHMENT: CapabilitySupportSchema,
    STATUS_CHECK: CapabilitySupportSchema,
    CANCEL: CapabilitySupportSchema,
  })
  .strict();

export type PublisherCapabilities = Readonly<z.infer<typeof PublisherCapabilitiesSchema>>;

export function normalizePublisherCapabilities(input: unknown): PublisherCapabilities {
  const normalized = unsupportedCapabilities();

  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const candidate = input as Record<string, unknown>;
    for (const capability of publisherCapabilityNames) {
      if (candidate[capability] === "SUPPORTED") {
        normalized[capability] = "SUPPORTED";
      }
    }
  }

  return Object.freeze(normalized);
}

export function supportsCapability(
  capabilities: PublisherCapabilities,
  capability: PublisherCapability,
): boolean {
  return capabilities[capability] === "SUPPORTED";
}

export const publisherKinds = ["MOCK", "SHOPEE_OFFICIAL_API", "SHOPEE_ANDROID"] as const;
export const PublisherKindSchema = z.enum(publisherKinds);
export type PublisherKind = z.infer<typeof PublisherKindSchema>;

export const publishModes = ["MOCK", "DRY_RUN", "REAL"] as const;
export const PublishModeSchema = z.enum(publishModes);
export type PublishMode = z.infer<typeof PublishModeSchema>;

const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const NullableIsoDateTimeSchema = IsoDateTimeSchema.nullable();

export const PublishRequestSchema = z
  .object({
    requestId: RequestIdSchema,
    idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/),
    workspaceId: WorkspaceIdSchema,
    jobId: PublishJobIdSchema,
    attemptId: PublishAttemptIdSchema,
    account: z
      .object({
        accountId: ShopeeAccountIdSchema,
        expectedDisplayName: z.string().min(1).max(200),
        countryCode: z.string().regex(/^[A-Z]{2}$/),
      })
      .strict(),
    media: z
      .object({
        assetId: MediaAssetIdSchema,
        storageKey: z.string().min(1).max(1_024),
        sha256Hex: z.string().regex(/^[a-f0-9]{64}$/),
        mimeType: z.string().regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i),
        sizeBytes: z.number().int().safe().nonnegative(),
      })
      .strict(),
    caption: z.string().max(10_000).nullable(),
    products: z.array(
      z
        .object({
          productReferenceId: ProductReferenceIdSchema,
          displayName: z.string().min(1).max(500),
          operatorReference: z.string().max(500).nullable(),
          productUrl: z.url().nullable(),
        })
        .strict(),
    ),
    mode: PublishModeSchema,
    deadlineAt: IsoDateTimeSchema,
  })
  .strict();

export type PublishRequest = Readonly<z.infer<typeof PublishRequestSchema>>;

export const PublisherErrorSchema = z
  .object({
    code: ErrorCodeSchema,
    category: ErrorCategorySchema,
    safeMessage: SafeMessageSchema,
    publishMayHaveOccurred: z.boolean(),
    retryAfterSeconds: z.number().int().safe().nonnegative().nullable(),
    sanitizedDetails: SafeMetadataSchema,
  })
  .strict();

export type PublisherError = Readonly<z.infer<typeof PublisherErrorSchema>>;

export function isRetryablePublisherError(error: PublisherError): boolean {
  return error.category === "RETRYABLE" && !error.publishMayHaveOccurred;
}

export const PublishReceiptSchema = z
  .object({
    disposition: z.enum(["ACCEPTED", "COMPLETED"]),
    externalReference: z.string().min(1).max(500).nullable(),
    submittedAt: NullableIsoDateTimeSchema,
    completedAt: NullableIsoDateTimeSchema,
    sanitizedMetadata: SafeMetadataSchema,
  })
  .strict();

export type PublishReceipt = Readonly<z.infer<typeof PublishReceiptSchema>>;

export const PublishStatusSchema = z
  .object({
    state: z.enum(["PENDING", "PUBLISHED", "REJECTED", "NOT_FOUND", "UNKNOWN"]),
    externalReference: z.string().min(1).max(500),
    checkedAt: IsoDateTimeSchema,
    publishedAt: NullableIsoDateTimeSchema,
    sanitizedMetadata: SafeMetadataSchema,
  })
  .strict();

export type PublishStatus = Readonly<z.infer<typeof PublishStatusSchema>>;

export const PublishResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), receipt: PublishReceiptSchema }).strict(),
  z.object({ ok: z.literal(false), error: PublisherErrorSchema }).strict(),
]);

export type PublishResult = Readonly<z.infer<typeof PublishResultSchema>>;

export const PublisherConnectionResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      capabilities: PublisherCapabilitiesSchema,
      adapterVersion: z.string().min(1).max(100),
    })
    .strict(),
  z.object({ ok: z.literal(false), error: PublisherErrorSchema }).strict(),
]);

export type PublisherConnectionResult = Readonly<z.infer<typeof PublisherConnectionResultSchema>>;
