import { ROLE_PERMISSIONS, type AuthenticatedContext } from "@otshop/shared";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import { ProjectItemReconciliationConflictError } from "./project-item-errors";
import type { ProjectItemRepositoryPort } from "./project-item-repository";
import { ProjectItemService } from "./project-item-service";
import { ProjectConflictError, ProjectNotConfigurableError } from "./project-errors";

const workspaceId = "01941f29-7c00-7000-8000-000000000001";
const userId = "01941f29-7c00-7000-8000-000000000002";
const sessionId = "01941f29-7c00-7000-8000-000000000003";
const projectId = "01941f29-7c00-7000-8000-000000000004";
const datasetId = "01941f29-7c00-7000-8000-000000000005";
const requestId = "01941f29-7c00-7000-8000-000000000006";
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

const repository = (
  state: "CONFLICT" | "MATERIALIZED" | "NOT_CONFIGURABLE" | "RECONCILIATION_CONFLICT",
) =>
  ({
    materialize: vi.fn(async () =>
      state === "MATERIALIZED"
        ? {
            state,
            result: {
              projectId,
              datasetId,
              projectVersion: 2,
              itemCount: 1,
              createdCount: 1,
              removedCount: 0,
              reorderedCount: 0,
              changed: true,
            },
          }
        : { state },
    ),
  }) satisfies ProjectItemRepositoryPort;

describe("ProjectItem materialization service", () => {
  it("requires canonical project write authorization before repository access", async () => {
    const store = repository("MATERIALIZED");
    const service = new ProjectItemService(store, logger);
    await expect(
      service.materialize({
        context: context("VIEWER"),
        requestId,
        projectId,
        body: { expectedVersion: 1 },
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(store.materialize).not.toHaveBeenCalled();
  });

  it("returns a bounded summary and passes only trusted workspace identity", async () => {
    const store = repository("MATERIALIZED");
    const service = new ProjectItemService(store, logger);
    await expect(
      service.materialize({
        context: context(),
        requestId,
        projectId,
        body: { expectedVersion: 1 },
      }),
    ).resolves.toMatchObject({ projectId, datasetId, itemCount: 1, changed: true });
    expect(store.materialize).toHaveBeenCalledWith({ workspaceId, projectId, expectedVersion: 1 });
  });

  it.each([
    ["CONFLICT", ProjectConflictError],
    ["NOT_CONFIGURABLE", ProjectNotConfigurableError],
    ["RECONCILIATION_CONFLICT", ProjectItemReconciliationConflictError],
  ] as const)("maps %s to a safe application error", async (state, ErrorType) => {
    const service = new ProjectItemService(repository(state), logger);
    await expect(
      service.materialize({
        context: context(),
        requestId,
        projectId,
        body: { expectedVersion: 1 },
      }),
    ).rejects.toBeInstanceOf(ErrorType);
  });
});
