import { createHash } from "node:crypto";

import {
  PublishRequestSchema,
  PublishResultSchema,
  PublishStatusSchema,
  PublisherCapabilitiesSchema,
  PublisherConnectionResultSchema,
  type PublishRequest,
  type PublishResult,
  type PublishStatus,
  type PublisherCapabilities,
  type PublisherError,
} from "@otshop/shared";
import { z } from "zod";

import type { Publisher } from "./publisher";

export const mockScenarios = [
  "SUCCESS",
  "RETRYABLE_FAILURE",
  "NON_RETRYABLE_FAILURE",
  "AUTH_REQUIRED",
  "DEVICE_OFFLINE",
  "UPLOAD_TIMEOUT",
  "UNKNOWN_PUBLISH_STATE",
] as const;

export const MockScenarioSchema = z.enum(mockScenarios);
export type MockScenario = z.infer<typeof MockScenarioSchema>;

export const MOCK_CAPABILITIES: PublisherCapabilities = Object.freeze({
  VIDEO_UPLOAD: "SUPPORTED",
  CAPTION: "SUPPORTED",
  PRODUCT_ATTACHMENT: "SUPPORTED",
  STATUS_CHECK: "SUPPORTED",
  CANCEL: "SUPPORTED",
});

const MOCK_TIME = "2000-01-01T00:00:00.000Z";

const errorForScenario = (scenario: Exclude<MockScenario, "SUCCESS">): PublisherError => {
  const errors: Record<Exclude<MockScenario, "SUCCESS">, PublisherError> = {
    RETRYABLE_FAILURE: {
      code: "NETWORK_ERROR",
      category: "RETRYABLE",
      safeMessage: "The mock publisher reported a retryable failure",
      publishMayHaveOccurred: false,
      retryAfterSeconds: 60,
      sanitizedDetails: { scenario },
    },
    NON_RETRYABLE_FAILURE: {
      code: "PLATFORM_REJECTED",
      category: "NON_RETRYABLE",
      safeMessage: "The mock publisher rejected the request",
      publishMayHaveOccurred: false,
      retryAfterSeconds: null,
      sanitizedDetails: { scenario },
    },
    AUTH_REQUIRED: {
      code: "AUTH_REQUIRED",
      category: "NON_RETRYABLE",
      safeMessage: "Publisher authentication is required",
      publishMayHaveOccurred: false,
      retryAfterSeconds: null,
      sanitizedDetails: { scenario },
    },
    DEVICE_OFFLINE: {
      code: "DEVICE_OFFLINE",
      category: "RETRYABLE",
      safeMessage: "The mock device is offline",
      publishMayHaveOccurred: false,
      retryAfterSeconds: 60,
      sanitizedDetails: { scenario },
    },
    UPLOAD_TIMEOUT: {
      code: "UPLOAD_TIMEOUT",
      category: "RETRYABLE",
      safeMessage: "The mock upload timed out before submission",
      publishMayHaveOccurred: false,
      retryAfterSeconds: 60,
      sanitizedDetails: { scenario },
    },
    UNKNOWN_PUBLISH_STATE: {
      code: "UPLOAD_TIMEOUT",
      category: "MANUAL_REVIEW_REQUIRED",
      safeMessage: "The mock publication state is uncertain and requires review",
      publishMayHaveOccurred: true,
      retryAfterSeconds: null,
      sanitizedDetails: { scenario },
    },
  };
  return errors[scenario];
};

export class MockPublisher implements Publisher {
  readonly kind = "MOCK" as const;

  constructor(
    private readonly scenario: MockScenario = "SUCCESS",
    private readonly capabilities: PublisherCapabilities = MOCK_CAPABILITIES,
  ) {}

  async validateConnection() {
    return PublisherConnectionResultSchema.parse({
      ok: true,
      adapterVersion: "mock-v1",
      capabilities: await this.getCapabilities(),
    });
  }

  async getCapabilities(): Promise<PublisherCapabilities> {
    return PublisherCapabilitiesSchema.parse(this.capabilities);
  }

  async publish(input: PublishRequest): Promise<PublishResult> {
    const request = PublishRequestSchema.parse(input);
    if (this.scenario !== "SUCCESS") {
      return PublishResultSchema.parse({ ok: false, error: errorForScenario(this.scenario) });
    }
    const reference = `mock:publication:${createHash("sha256")
      .update(request.idempotencyKey)
      .digest("hex")
      .slice(0, 24)}`;
    return PublishResultSchema.parse({
      ok: true,
      receipt: {
        disposition: "COMPLETED",
        externalReference: reference,
        submittedAt: MOCK_TIME,
        completedAt: MOCK_TIME,
        sanitizedMetadata: {
          scenario: this.scenario,
          requestId: request.requestId,
          mockReference: reference,
        },
      },
    });
  }

  async checkStatus(input: { readonly externalReference: string }): Promise<PublishStatus> {
    return PublishStatusSchema.parse({
      state: "PUBLISHED",
      externalReference: input.externalReference,
      checkedAt: MOCK_TIME,
      publishedAt: MOCK_TIME,
      sanitizedMetadata: { scenario: this.scenario },
    });
  }

  async cancel(): Promise<Readonly<{ cancelled: boolean }>> {
    return { cancelled: false };
  }
}
