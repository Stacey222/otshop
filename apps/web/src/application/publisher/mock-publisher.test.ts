import { isRetryablePublisherError } from "@otshop/shared";
import { describe, expect, it } from "vitest";

import { MockPublisher, mockScenarios } from "./mock-publisher";
import { publisherTestRequest, testRequestId } from "./publisher-test-fixtures";

const failureExpectations = {
  RETRYABLE_FAILURE: ["NETWORK_ERROR", "RETRYABLE", false, true],
  NON_RETRYABLE_FAILURE: ["PLATFORM_REJECTED", "NON_RETRYABLE", false, false],
  AUTH_REQUIRED: ["AUTH_REQUIRED", "NON_RETRYABLE", false, false],
  DEVICE_OFFLINE: ["DEVICE_OFFLINE", "RETRYABLE", false, true],
  UPLOAD_TIMEOUT: ["UPLOAD_TIMEOUT", "RETRYABLE", false, true],
  UNKNOWN_PUBLISH_STATE: ["UPLOAD_TIMEOUT", "MANUAL_REVIEW_REQUIRED", true, false],
} as const;

describe("deterministic MockPublisher", () => {
  it("returns the same clearly synthetic successful result for the same request", async () => {
    const publisher = new MockPublisher("SUCCESS");
    const request = publisherTestRequest();
    const first = await publisher.publish(request);
    const second = await publisher.publish(request);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected mock success");
    expect(first.receipt.externalReference).toMatch(/^mock:publication:[a-f0-9]{24}$/u);
    expect(first.receipt.sanitizedMetadata).toMatchObject({
      scenario: "SUCCESS",
      requestId: testRequestId,
    });
    for (const secret of ["password", "cookie", "authorization", "DATABASE_URL"]) {
      expect(JSON.stringify(first)).not.toContain(secret);
    }
  });

  it.each(Object.entries(failureExpectations))(
    "maps %s to a canonical deterministic failure",
    async (scenario, [code, category, mayHaveOccurred, retryable]) => {
      const result = await new MockPublisher(scenario as keyof typeof failureExpectations).publish(
        publisherTestRequest(),
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected mock failure");
      expect(result.error).toMatchObject({
        code,
        category,
        publishMayHaveOccurred: mayHaveOccurred,
      });
      expect(isRetryablePublisherError(result.error)).toBe(retryable);
    },
  );

  it("supports every required scenario without randomness", () => {
    expect(mockScenarios).toEqual([
      "SUCCESS",
      "RETRYABLE_FAILURE",
      "NON_RETRYABLE_FAILURE",
      "AUTH_REQUIRED",
      "DEVICE_OFFLINE",
      "UPLOAD_TIMEOUT",
      "UNKNOWN_PUBLISH_STATE",
    ]);
  });

  it("never marks uncertain publication as retryable", async () => {
    const result = await new MockPublisher("UNKNOWN_PUBLISH_STATE").publish(publisherTestRequest());
    if (result.ok) throw new Error("Expected uncertain mock result");
    expect(result.error.category).toBe("MANUAL_REVIEW_REQUIRED");
    expect(result.error.publishMayHaveOccurred).toBe(true);
    expect(isRetryablePublisherError(result.error)).toBe(false);
  });
});
