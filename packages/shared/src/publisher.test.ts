import { describe, expect, it } from "vitest";

import {
  PublishRequestSchema,
  PublishResultSchema,
  PublisherCapabilitiesSchema,
  PublisherCapabilitySchema,
  isRetryablePublisherError,
  normalizePublisherCapabilities,
  supportsCapability,
} from "./publisher";

const ids = {
  request: "01941f29-7c00-7000-8000-000000000001",
  workspace: "01941f29-7c00-7000-8000-000000000002",
  job: "01941f29-7c00-7000-8000-000000000003",
  attempt: "01941f29-7c00-7000-8000-000000000004",
  account: "01941f29-7c00-7000-8000-000000000005",
  asset: "01941f29-7c00-7000-8000-000000000006",
  product: "01941f29-7c00-7000-8000-000000000007",
} as const;

const validRequest = {
  requestId: ids.request,
  idempotencyKey: "a".repeat(64),
  workspaceId: ids.workspace,
  jobId: ids.job,
  attemptId: ids.attempt,
  account: {
    accountId: ids.account,
    expectedDisplayName: "Authorized test account",
    countryCode: "ID",
  },
  media: {
    assetId: ids.asset,
    storageKey: "workspace/object/opaque-key",
    sha256Hex: "b".repeat(64),
    mimeType: "video/mp4",
    sizeBytes: 1_000,
  },
  caption: "Safe caption",
  products: [
    {
      productReferenceId: ids.product,
      displayName: "Operator-selected product",
      operatorReference: null,
      productUrl: null,
    },
  ],
  mode: "MOCK",
  deadlineAt: "2026-08-24T10:00:00+07:00",
} as const;

describe("publisher capability contracts", () => {
  it("rejects unknown capability names and strict capability payload keys", () => {
    expect(PublisherCapabilitySchema.safeParse("FUTURE_CAPABILITY").success).toBe(false);
    expect(
      PublisherCapabilitiesSchema.safeParse({
        ...normalizePublisherCapabilities({}),
        FUTURE_CAPABILITY: "SUPPORTED",
      }).success,
    ).toBe(false);
  });

  it("defaults missing, malformed, and unknown capabilities to unsupported", () => {
    const capabilities = normalizePublisherCapabilities({
      VIDEO_UPLOAD: "SUPPORTED",
      CAPTION: true,
      FUTURE_CAPABILITY: "SUPPORTED",
    });

    expect(supportsCapability(capabilities, "VIDEO_UPLOAD")).toBe(true);
    expect(supportsCapability(capabilities, "CAPTION")).toBe(false);
    expect(supportsCapability(capabilities, "PRODUCT_ATTACHMENT")).toBe(false);
    expect(Object.isFrozen(capabilities)).toBe(true);
  });
});

describe("publisher wire contracts", () => {
  it("accepts the Phase 1 platform-neutral publish request", () => {
    expect(PublishRequestSchema.parse(validRequest)).toEqual(validRequest);
  });

  it("rejects secret-bearing or arbitrary extra request fields", () => {
    expect(PublishRequestSchema.safeParse({ ...validRequest, password: "secret" }).success).toBe(
      false,
    );
    expect(
      PublishRequestSchema.safeParse({
        ...validRequest,
        media: { ...validRequest.media, filesystemPath: "C:\\private\\video.mp4" },
      }).success,
    ).toBe(false);
  });

  it("rejects negative byte sizes at the wire boundary", () => {
    expect(
      PublishRequestSchema.safeParse({
        ...validRequest,
        media: { ...validRequest.media, sizeBytes: -1 },
      }).success,
    ).toBe(false);
  });

  it("represents success without assuming an external reference", () => {
    const result = PublishResultSchema.parse({
      ok: true,
      receipt: {
        disposition: "COMPLETED",
        externalReference: null,
        submittedAt: "2026-08-24T03:00:00Z",
        completedAt: "2026-08-24T03:01:00Z",
        sanitizedMetadata: { adapter: "mock" },
      },
    });
    expect(result.ok).toBe(true);
  });

  it("represents unknown publication state as a non-retryable manual-review result", () => {
    const result = PublishResultSchema.parse({
      ok: false,
      error: {
        code: "UPLOAD_TIMEOUT",
        category: "MANUAL_REVIEW_REQUIRED",
        safeMessage: "Publication result could not be confirmed",
        publishMayHaveOccurred: true,
        retryAfterSeconds: null,
        sanitizedDetails: {},
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(isRetryablePublisherError(result.error)).toBe(false);
      expect(result.error.publishMayHaveOccurred).toBe(true);
    }
  });

  it("permits retry only when the category and side-effect knowledge both allow it", () => {
    expect(
      isRetryablePublisherError({
        code: "NETWORK_ERROR",
        category: "RETRYABLE",
        safeMessage: "Temporary network failure before submission",
        publishMayHaveOccurred: false,
        retryAfterSeconds: 30,
        sanitizedDetails: {},
      }),
    ).toBe(true);
    expect(
      isRetryablePublisherError({
        code: "NETWORK_ERROR",
        category: "RETRYABLE",
        safeMessage: "Publication may have occurred",
        publishMayHaveOccurred: true,
        retryAfterSeconds: null,
        sanitizedDetails: {},
      }),
    ).toBe(false);
  });

  it("rejects a negative publisher retry delay", () => {
    expect(
      PublishResultSchema.safeParse({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          category: "RETRYABLE",
          safeMessage: "Wait before retrying",
          publishMayHaveOccurred: false,
          retryAfterSeconds: -1,
          sanitizedDetails: {},
        },
      }).success,
    ).toBe(false);
  });
});
