import {
  AuthenticatedContextSchema,
  ProjectIdSchema,
  ProjectItemMaterializeRequestSchema,
  hasPermission,
  type AuthenticatedContext,
  type RequestId,
} from "@otshop/shared";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import { ProjectItemReconciliationConflictError } from "./project-item-errors";
import type { ProjectItemRepositoryPort } from "./project-item-repository";
import {
  ProjectArchivedError,
  ProjectConflictError,
  ProjectInvalidDatasetError,
  ProjectNotConfigurableError,
  ProjectNotFoundError,
  ProjectPersistenceFailureError,
} from "./project-errors";

export class ProjectItemService {
  constructor(
    private readonly repository: ProjectItemRepositoryPort,
    private readonly log: ApplicationLogger,
  ) {}

  async materialize(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly projectId: string;
    readonly body: unknown;
  }) {
    const context = AuthenticatedContextSchema.parse(input.context);
    if (
      !hasPermission(context.role, "projects.write") ||
      !context.permissions.includes("projects.write")
    ) {
      throw new AuthorizationDeniedError();
    }
    const projectId = ProjectIdSchema.safeParse(input.projectId);
    if (!projectId.success) throw new ProjectNotFoundError();
    const body = ProjectItemMaterializeRequestSchema.parse(input.body);
    const startedAt = performance.now();
    let outcome;
    try {
      outcome = await this.repository.materialize({
        workspaceId: context.workspaceId,
        projectId: projectId.data,
        expectedVersion: body.expectedVersion,
      });
    } catch {
      throw new ProjectPersistenceFailureError();
    }
    if (outcome.state === "NOT_FOUND") throw new ProjectNotFoundError();
    if (outcome.state === "ARCHIVED") throw new ProjectArchivedError();
    if (outcome.state === "CONFLICT") throw new ProjectConflictError();
    if (outcome.state === "INVALID_DATASET") throw new ProjectInvalidDatasetError();
    if (outcome.state === "NOT_CONFIGURABLE") throw new ProjectNotConfigurableError();
    if (outcome.state === "RECONCILIATION_CONFLICT") {
      throw new ProjectItemReconciliationConflictError();
    }
    if (outcome.state !== "MATERIALIZED") throw new ProjectPersistenceFailureError();
    this.log.info("project-items.materialization.completed", {
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      projectId: projectId.data,
      operation: "MATERIALIZE",
      result: "SUCCESS",
      changed: outcome.result.changed,
      itemCount: outcome.result.itemCount,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return outcome.result;
  }
}
