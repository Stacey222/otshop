import { ApiErrorEnvelopeSchema } from "@otshop/shared";
import { describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import { ApplicationError } from "@/application/errors/application-error";
import {
  MediaInspectionInProgressError,
  MediaNotFoundError,
  MediaNotReadyError,
  ThumbnailGenerationInProgressError,
} from "@/application/media/media-errors";
import {
  DatasetArchivedError,
  DatasetItemNotFoundError,
  DatasetNotFoundError,
} from "@/application/datasets/dataset-errors";
import {
  MediaBatchConflictError,
  MediaBatchLimitError,
  MediaBatchNotFoundError,
} from "@/application/media-batches/media-batch-errors";
import {
  ProjectArchivedError,
  ProjectConflictError,
  ProjectNotFoundError,
} from "@/application/projects/project-errors";
import {
  ProjectItemNotFoundError,
  ProjectItemProductAccountMismatchError,
  ProjectItemProductConflictError,
  ProjectItemReconciliationConflictError,
} from "@/application/projects/project-item-errors";
import {
  ShopeeAccountArchivedError,
  ShopeeAccountNotFoundError,
} from "@/application/accounts/account-errors";
import {
  AffiliateProductConflictError,
  AffiliateProductNotFoundError,
} from "@/application/products/affiliate-product-errors";

import { errorResponse, mapErrorToSafeHttp } from "./api-response";

const requestId = "018f0000-0000-7000-8000-000000000000" as const;

describe("safe API error boundary", () => {
  it("maps known authorization failures deterministically", () => {
    expect(mapErrorToSafeHttp(new AuthorizationDeniedError())).toMatchObject({
      status: 403,
      body: { code: "AUTHORIZATION_DENIED" },
    });
  });

  it("maps product-assignment lookup, compatibility, and concurrency errors safely", () => {
    expect(mapErrorToSafeHttp(new ProjectItemNotFoundError())).toMatchObject({ status: 404 });
    expect(mapErrorToSafeHttp(new ProjectItemProductAccountMismatchError())).toMatchObject({
      status: 409,
    });
    expect(mapErrorToSafeHttp(new ProjectItemProductConflictError())).toMatchObject({
      status: 409,
    });
  });

  it("maps thumbnail eligibility and concurrency failures safely", () => {
    expect(mapErrorToSafeHttp(new MediaNotReadyError())).toMatchObject({
      status: 409,
      body: { code: "MEDIA_NOT_READY" },
    });
    expect(mapErrorToSafeHttp(new ThumbnailGenerationInProgressError())).toMatchObject({
      status: 409,
      body: { code: "THUMBNAIL_GENERATION_IN_PROGRESS" },
    });
  });

  it("maps dataset not-found and lifecycle errors safely", () => {
    expect(mapErrorToSafeHttp(new DatasetNotFoundError())).toMatchObject({
      status: 404,
      body: { code: "DATASET_NOT_FOUND" },
    });
    expect(mapErrorToSafeHttp(new DatasetItemNotFoundError())).toMatchObject({
      status: 404,
      body: { code: "DATASET_ITEM_NOT_FOUND" },
    });
    expect(mapErrorToSafeHttp(new DatasetArchivedError())).toMatchObject({
      status: 409,
      body: { code: "DATASET_ARCHIVED" },
    });
  });

  it("maps batch not-found, conflict, and limit errors safely", () => {
    expect(mapErrorToSafeHttp(new MediaBatchNotFoundError())).toMatchObject({ status: 404 });
    expect(mapErrorToSafeHttp(new MediaBatchConflictError())).toMatchObject({ status: 409 });
    expect(mapErrorToSafeHttp(new MediaBatchLimitError())).toMatchObject({ status: 413 });
  });

  it("maps project not-found and immutable/conflict errors safely", () => {
    expect(mapErrorToSafeHttp(new ProjectNotFoundError())).toMatchObject({ status: 404 });
    expect(mapErrorToSafeHttp(new ProjectArchivedError())).toMatchObject({ status: 409 });
    expect(mapErrorToSafeHttp(new ProjectConflictError())).toMatchObject({ status: 409 });
  });

  it("maps ProjectItem reconciliation conflicts without internal details", () => {
    expect(mapErrorToSafeHttp(new ProjectItemReconciliationConflictError())).toMatchObject({
      status: 409,
      body: { code: "PROJECT_ITEM_RECONCILIATION_CONFLICT" },
    });
  });

  it("maps local account and affiliate product errors without persistence details", () => {
    expect(mapErrorToSafeHttp(new ShopeeAccountNotFoundError())).toMatchObject({ status: 404 });
    expect(mapErrorToSafeHttp(new ShopeeAccountArchivedError())).toMatchObject({ status: 409 });
    expect(mapErrorToSafeHttp(new AffiliateProductNotFoundError())).toMatchObject({ status: 404 });
    expect(mapErrorToSafeHttp(new AffiliateProductConflictError())).toMatchObject({ status: 409 });
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
