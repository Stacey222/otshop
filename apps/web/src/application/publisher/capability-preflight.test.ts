import { normalizePublisherCapabilities } from "@otshop/shared";
import { describe, expect, it } from "vitest";

import { PublisherPreflightInputSchema } from "./publisher-api";
import { deriveRequiredCapabilities, preflightPublisher } from "./capability-preflight";
import { publisherTestRequest } from "./publisher-test-fixtures";

describe("server-derived publisher capability pre-flight", () => {
  it("is ready only when every derived capability is explicitly supported", () => {
    const request = publisherTestRequest();
    expect(
      preflightPublisher({
        available: true,
        publisherKind: "MOCK",
        request,
        capabilities: normalizePublisherCapabilities({ VIDEO_UPLOAD: "SUPPORTED" }),
      }),
    ).toMatchObject({
      ready: true,
      requiredCapabilities: ["VIDEO_UPLOAD"],
      missingCapabilities: [],
    });
  });

  it("blocks missing video upload support before execution", () => {
    const result = preflightPublisher({
      available: true,
      publisherKind: "MOCK",
      request: publisherTestRequest(),
      capabilities: normalizePublisherCapabilities({}),
    });
    expect(result.ready).toBe(false);
    expect(result.missingCapabilities).toEqual(["VIDEO_UPLOAD"]);
  });

  it("derives caption and product attachment requirements from request content", () => {
    const request = publisherTestRequest({
      caption: "Operator-provided caption",
      products: [
        {
          productReferenceId: "018f0000-0000-7000-8000-000000000010",
          displayName: "Mock product",
          operatorReference: null,
          productUrl: null,
        },
      ],
    });
    expect(deriveRequiredCapabilities(request)).toEqual([
      "VIDEO_UPLOAD",
      "CAPTION",
      "PRODUCT_ATTACHMENT",
    ]);
  });

  it("rejects client-supplied required-capability claims", () => {
    expect(
      PublisherPreflightInputSchema.safeParse({
        publisherKind: "MOCK",
        request: publisherTestRequest(),
        requiredCapabilities: [],
      }).success,
    ).toBe(false);
  });
});
