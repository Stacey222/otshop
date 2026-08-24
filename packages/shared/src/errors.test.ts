import { describe, expect, it } from "vitest";

import { ApiErrorEnvelopeSchema, createApiErrorEnvelope } from "./errors";
import { RequestIdSchema } from "./identifiers";

describe("safe API error envelope", () => {
  const requestId = RequestIdSchema.parse("01941f29-7c00-7000-8000-000000000001");

  it("serializes only allowlisted public fields", () => {
    const internalError = {
      category: "NON_RETRYABLE" as const,
      code: "CONFIGURATION_INVALID",
      message: "The request configuration is invalid",
      retryable: false,
      safeMetadata: { fieldCount: 2 },
      stack: "internal stack",
      password: "must-not-leak",
    };

    const envelope = createApiErrorEnvelope(internalError, requestId);
    expect(envelope).toEqual({
      error: {
        category: "NON_RETRYABLE",
        code: "CONFIGURATION_INVALID",
        message: "The request configuration is invalid",
        requestId,
        retryable: false,
      },
    });
    expect(JSON.stringify(envelope)).not.toContain("stack");
    expect(JSON.stringify(envelope)).not.toContain("password");
    expect(JSON.stringify(envelope)).not.toContain("must-not-leak");
  });

  it("allows structured safe validation details", () => {
    const envelope = createApiErrorEnvelope(
      {
        category: "NON_RETRYABLE",
        code: "CONFIGURATION_INVALID",
        message: "Validation failed",
        retryable: false,
        safeMetadata: {},
      },
      requestId,
      [
        {
          code: "VALUE_INVALID",
          field: "countryCode",
          message: "Expected a two-letter country code",
        },
      ],
    );
    expect(ApiErrorEnvelopeSchema.parse(envelope)).toEqual(envelope);
  });

  it("rejects stack traces and other undeclared internal fields", () => {
    expect(
      ApiErrorEnvelopeSchema.safeParse({
        error: {
          category: "NON_RETRYABLE",
          code: "UNKNOWN_ERROR",
          message: "Unable to complete the request",
          requestId,
          retryable: false,
          stack: "secret internals",
        },
      }).success,
    ).toBe(false);
  });
});
