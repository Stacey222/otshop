import { ApiErrorEnvelopeSchema } from "@otshop/shared";
import { describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import { ApplicationError } from "@/application/errors/application-error";
import {
  MediaInspectionInProgressError,
  MediaNotFoundError,
} from "@/application/media/media-errors";

import { errorResponse, mapErrorToSafeHttp } from "./api-response";

const requestId = "018f0000-0000-7000-8000-000000000000" as const;

describe("safe API error boundary", () => {
  it("maps known authorization failures deterministically", () => {
    expect(mapErrorToSafeHttp(new AuthorizationDeniedError())).toMatchObject({
      status: 403,
      body: { code: "AUTHORIZATION_DENIED" },
    });
  });

  it("maps stable error names across production bundle boundaries", () => {
    const bundledError = new Error("internal copy message");
    bundledError.name = "AuthenticationRequiredError";
    expect(mapErrorToSafeHttp(bundledError)).toMatchObject({
      status: 401,
      body: { code: "AUTH_REQUIRED", message: "Authentication required" },
    });
  });

  it("maps inspection lookup and concurrency errors without leaking asset existence", () => {
    expect(mapErrorToSafeHttp(new MediaNotFoundError())).toMatchObject({
      status: 404,
      body: { code: "MEDIA_NOT_FOUND" },
    });
    expect(mapErrorToSafeHttp(new MediaInspectionInProgressError())).toMatchObject({
      status: 409,
      body: { code: "MEDIA_INSPECTION_IN_PROGRESS" },
    });
  });

  it("sanitizes unknown database errors and never exposes stacks", async () => {
    const internal = new Error(
      "Prisma P1001 at D:\\private\\schema.prisma postgresql://user:secret@database/private",
    );
    internal.stack = `private stack ${internal.message}`;
    const response = errorResponse(internal, requestId);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(ApiErrorEnvelopeSchema.parse(JSON.parse(serialized)).error.requestId).toBe(requestId);
    for (const forbidden of ["Prisma", "schema.prisma", "postgresql", "secret", "stack"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("does not serialize safe metadata or secret metadata from application errors", async () => {
    const response = errorResponse(
      new ApplicationError({
        category: "NON_RETRYABLE",
        code: "CONFIGURATION_INVALID",
        message: "Configuration is unavailable",
        retryable: false,
        safeMetadata: { databaseUrl: "postgresql://user:secret@database/private" },
      }),
      requestId,
    );
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain("CONFIGURATION_INVALID");
    expect(serialized).not.toContain("databaseUrl");
    expect(serialized).not.toContain("secret");
  });
});
