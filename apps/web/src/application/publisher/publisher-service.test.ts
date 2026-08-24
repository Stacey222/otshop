import type { FeatureFlags } from "@otshop/shared";
import { describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";
import { errorResponse } from "@/infrastructure/http/api-response";

import { MockExecutionUnavailableError, PublisherUnavailableError } from "./publisher-errors";
import { PublisherRegistry } from "./publisher-registry";
import { PublisherService } from "./publisher-service";
import {
  otherWorkspaceId,
  publisherTestContext,
  publisherTestRequest,
  testRequestId,
} from "./publisher-test-fixtures";

const features: FeatureFlags = {
  realPublishEnabled: false,
  schedulerEnabled: false,
  shopeeAndroidEnabled: false,
  shopeeOfficialApiEnabled: false,
  workerProtocolEnabled: false,
  workerRealPublishAllowed: false,
};

const captureLogger = (records: Array<Record<string, unknown>>): ApplicationLogger => ({
  debug: (message, context = {}) => records.push({ ...context, message }),
  error: (message, context = {}) => records.push({ ...context, message }),
  info: (message, context = {}) => records.push({ ...context, message }),
  warn: (message, context = {}) => records.push({ ...context, message }),
  withContext: () => captureLogger(records),
});

const service = (
  nodeEnv: "development" | "production" | "test" = "test",
  records: Array<Record<string, unknown>> = [],
) => new PublisherService(new PublisherRegistry(features), captureLogger(records), nodeEnv);

describe("workspace-scoped publisher application service", () => {
  it("executes only after permission and emits safe summary logs", async () => {
    const records: Array<Record<string, unknown>> = [];
    const result = await service("test", records).executeMock({
      context: publisherTestContext("OPERATOR"),
      request: publisherTestRequest({ caption: "must not enter logs" }),
      requestId: testRequestId,
      scenario: "SUCCESS",
    });
    expect(result.ok).toBe(true);
    expect(records).toContainEqual(
      expect.objectContaining({
        requestId: testRequestId,
        publisherId: "MOCK",
        operation: "publish",
        scenario: "SUCCESS",
        resultCategory: "SUCCESS",
      }),
    );
    expect(JSON.stringify(records)).not.toContain("must not enter logs");
  });

  it("denies missing projects.run permission", async () => {
    await expect(
      service().executeMock({
        context: publisherTestContext("VIEWER"),
        request: publisherTestRequest(),
        requestId: testRequestId,
        scenario: "SUCCESS",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("rejects a canonical request referencing another workspace", async () => {
    await expect(
      service().executeMock({
        context: publisherTestContext(),
        request: publisherTestRequest({ workspaceId: otherWorkspaceId }),
        requestId: testRequestId,
        scenario: "SUCCESS",
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("keeps real publishers unavailable and never falls back to mock", async () => {
    await expect(
      service().preflight({
        context: publisherTestContext(),
        publisherKind: "SHOPEE_ANDROID",
        request: publisherTestRequest(),
        requestId: testRequestId,
      }),
    ).rejects.toBeInstanceOf(PublisherUnavailableError);
  });

  it("blocks mock scenario controls in production", async () => {
    await expect(
      service("production").executeMock({
        context: publisherTestContext(),
        request: publisherTestRequest(),
        requestId: testRequestId,
        scenario: "SUCCESS",
      }),
    ).rejects.toBeInstanceOf(MockExecutionUnavailableError);
  });

  it("maps uncertain publisher failure through the existing safe envelope", async () => {
    let failure: unknown;
    try {
      await service().executeMock({
        context: publisherTestContext(),
        request: publisherTestRequest(),
        requestId: testRequestId,
        scenario: "UNKNOWN_PUBLISH_STATE",
      });
    } catch (error) {
      failure = error;
    }
    const response = errorResponse(failure, testRequestId);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        category: "MANUAL_REVIEW_REQUIRED",
        code: "UPLOAD_TIMEOUT",
        requestId: testRequestId,
        retryable: false,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/password|cookie|authorization|DATABASE_URL/u);
  });
});
