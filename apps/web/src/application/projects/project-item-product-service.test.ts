import { ROLE_PERMISSIONS, type AuthenticatedContext } from "@otshop/shared";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import {
  ProjectItemProductAccountMismatchError,
  ProjectItemProductArchivedError,
  ProjectItemProductConflictError,
} from "./project-item-errors";
import type { ProjectItemProductRepositoryPort } from "./project-item-product-repository";
import { ProjectItemProductService } from "./project-item-product-service";

const workspaceId = "01941f29-7c00-7000-8000-000000000001";
const userId = "01941f29-7c00-7000-8000-000000000002";
const sessionId = "01941f29-7c00-7000-8000-000000000003";
const projectId = "01941f29-7c00-7000-8000-000000000004";
const projectItemId = "01941f29-7c00-7000-8000-000000000005";
const productId = "01941f29-7c00-7000-8000-000000000006";
const accountId = "01941f29-7c00-7000-8000-000000000007";
const requestId = "01941f29-7c00-7000-8000-000000000008";

const context = (role: AuthenticatedContext["role"] = "ADMIN"): AuthenticatedContext => ({
  workspaceId,
  userId,
  sessionId,
  role,
  permissions: ROLE_PERMISSIONS[role],
});
const logger: ApplicationLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  withContext() {
    return this;
  },
};
const record = {
  projectId,
  projectItemId,
  projectVersion: 2,
  projectStatus: "DRAFT",
  projectItemStatus: "ACTIVE",
  assignment: { productId, accountId, displayName: "Local product", status: "ACTIVE" },
};

const repository = (
  state: "ASSIGNED" | "CONFLICT" | "PRODUCT_ACCOUNT_MISMATCH" | "PRODUCT_ARCHIVED",
) =>
  ({
    find: vi.fn(async () => ({ state: "FOUND", result: record }) as const),
    assign: vi.fn(async () =>
      state === "ASSIGNED"
        ? ({ state, changed: true, result: record } as const)
        : ({ state } as const),
    ),
    remove: vi.fn(async () => ({ state: "REMOVED", changed: true, result: record }) as const),
    assignAll: vi.fn(
      async () =>
        ({
          state: "BULK_ASSIGNED",
          changed: true,
          projectId,
          projectVersion: 2,
          itemCount: 1,
          changedCount: 1,
          productId,
        }) as const,
    ),
  }) satisfies ProjectItemProductRepositoryPort;

describe("ProjectItem product assignment service", () => {
  it("requires canonical project write permission before repository access", async () => {
    const store = repository("ASSIGNED");
    const service = new ProjectItemProductService(store, logger);
    await expect(
      service.assign({
        context: context("VIEWER"),
        requestId,
        projectId,
        projectItemId,
        body: { productId, expectedVersion: 1 },
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(store.assign).not.toHaveBeenCalled();
  });

  it("passes only authenticated workspace identity and bounded canonical input", async () => {
    const store = repository("ASSIGNED");
    const service = new ProjectItemProductService(store, logger);
    await expect(
      service.assign({
        context: context(),
        requestId,
        projectId,
        projectItemId,
        body: { productId, expectedVersion: 1 },
      }),
    ).resolves.toMatchObject({ changed: true, projectVersion: 2 });
    expect(store.assign).toHaveBeenCalledWith({
      workspaceId,
      projectId,
      projectItemId,
      productId,
      expectedVersion: 1,
    });
  });

  it.each([
    ["CONFLICT", ProjectItemProductConflictError],
    ["PRODUCT_ARCHIVED", ProjectItemProductArchivedError],
    ["PRODUCT_ACCOUNT_MISMATCH", ProjectItemProductAccountMismatchError],
  ] as const)("maps %s to a safe domain error", async (state, ErrorType) => {
    const service = new ProjectItemProductService(repository(state), logger);
    await expect(
      service.assign({
        context: context(),
        requestId,
        projectId,
        projectItemId,
        body: { productId, expectedVersion: 1 },
      }),
    ).rejects.toBeInstanceOf(ErrorType);
  });

  it("supports deterministic all-materialized-items assignment", async () => {
    const store = repository("ASSIGNED");
    const service = new ProjectItemProductService(store, logger);
    await expect(
      service.assignAll({
        context: context(),
        requestId,
        projectId,
        body: { productId, expectedVersion: 1 },
      }),
    ).resolves.toMatchObject({ itemCount: 1, changedCount: 1 });
    expect(store.assignAll).toHaveBeenCalledWith({
      workspaceId,
      projectId,
      productId,
      expectedVersion: 1,
    });
  });
});
