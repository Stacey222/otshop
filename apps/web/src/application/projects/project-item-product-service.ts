import {
  AuthenticatedContextSchema,
  ProductReferenceIdSchema,
  ProjectIdSchema,
  ProjectItemIdSchema,
  ProjectItemProductAssignRequestSchema,
  ProjectItemProductBulkAssignRequestSchema,
  ProjectItemProductRemoveRequestSchema,
  hasPermission,
  type AuthenticatedContext,
  type Permission,
  type RequestId,
} from "@otshop/shared";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import {
  ProjectItemArchivedError,
  ProjectItemNotFoundError,
  ProjectItemProductAccountMismatchError,
  ProjectItemProductArchivedError,
  ProjectItemProductConflictError,
  ProjectItemProductLimitError,
  ProjectItemProductNotFoundError,
} from "./project-item-errors";
import type {
  ProjectItemProductFailure,
  ProjectItemProductRepositoryPort,
} from "./project-item-product-repository";
import {
  ProjectConflictError,
  ProjectNotConfigurableError,
  ProjectNotFoundError,
  ProjectPersistenceFailureError,
} from "./project-errors";

export class ProjectItemProductService {
  constructor(
    private readonly repository: ProjectItemProductRepositoryPort,
    private readonly log: ApplicationLogger,
  ) {}

  private authorize(context: AuthenticatedContext, permission: Permission) {
    const canonical = AuthenticatedContextSchema.parse(context);
    if (!hasPermission(canonical.role, permission) || !canonical.permissions.includes(permission)) {
      throw new AuthorizationDeniedError();
    }
    return canonical;
  }

  private projectId(projectIdInput: string) {
    const projectId = ProjectIdSchema.safeParse(projectIdInput);
    if (!projectId.success) throw new ProjectNotFoundError();
    return projectId.data;
  }

  private projectItemId(projectItemIdInput: string) {
    const projectItemId = ProjectItemIdSchema.safeParse(projectItemIdInput);
    if (!projectItemId.success) throw new ProjectItemNotFoundError();
    return projectItemId.data;
  }

  private failure(state: ProjectItemProductFailure): never {
    if (state === "PROJECT_NOT_FOUND") throw new ProjectNotFoundError();
    if (state === "ITEM_NOT_FOUND") throw new ProjectItemNotFoundError();
    if (state === "ITEM_ARCHIVED") throw new ProjectItemArchivedError();
    if (state === "PRODUCT_NOT_FOUND") throw new ProjectItemProductNotFoundError();
    if (state === "PRODUCT_ARCHIVED") throw new ProjectItemProductArchivedError();
    if (state === "PRODUCT_ACCOUNT_MISMATCH") {
      throw new ProjectItemProductAccountMismatchError();
    }
    if (state === "PROJECT_NOT_DRAFT") throw new ProjectNotConfigurableError();
    if (state === "ITEM_LIMIT") throw new ProjectItemProductLimitError();
    if (state === "CONFLICT") throw new ProjectItemProductConflictError();
    throw new ProjectConflictError();
  }

  private completed(input: {
    readonly requestId: RequestId;
    readonly workspaceId: string;
    readonly projectId: string;
    readonly projectItemId?: string;
    readonly productId?: string;
    readonly operation: "ASSIGN" | "BULK_ASSIGN" | "REMOVE";
    readonly startedAt: number;
  }) {
    this.log.info("project-item.product-assignment.completed", {
      requestId: input.requestId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      ...(input.projectItemId === undefined ? {} : { projectItemId: input.projectItemId }),
      ...(input.productId === undefined ? {} : { productId: input.productId }),
      operation: input.operation,
      result: "SUCCESS",
      durationMs: Math.round(performance.now() - input.startedAt),
    });
  }

  async get(input: {
    readonly context: AuthenticatedContext;
    readonly projectId: string;
    readonly projectItemId: string;
  }) {
    const context = this.authorize(input.context, "projects.read");
    const projectId = this.projectId(input.projectId);
    const projectItemId = this.projectItemId(input.projectItemId);
    let result;
    try {
      result = await this.repository.find({
        workspaceId: context.workspaceId,
        projectId,
        projectItemId,
      });
    } catch {
      throw new ProjectPersistenceFailureError();
    }
    if (result.state !== "FOUND") this.failure(result.state);
    return result.result;
  }

  async assign(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly projectId: string;
    readonly projectItemId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "projects.write");
    const projectId = this.projectId(input.projectId);
    const projectItemId = this.projectItemId(input.projectItemId);
    const body = ProjectItemProductAssignRequestSchema.parse(input.body);
    return this.mutate({
      context,
      requestId: input.requestId,
      projectId,
      projectItemId,
      body,
      operation: "ASSIGN",
    });
  }

  async remove(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly projectId: string;
    readonly projectItemId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "projects.write");
    const projectId = this.projectId(input.projectId);
    const projectItemId = this.projectItemId(input.projectItemId);
    const body = ProjectItemProductRemoveRequestSchema.parse(input.body);
    return this.mutate({
      context,
      requestId: input.requestId,
      projectId,
      projectItemId,
      body,
      operation: "REMOVE",
    });
  }

  private async mutate(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly projectId: string;
    readonly projectItemId: string;
    readonly body: { readonly expectedVersion: number; readonly productId?: string };
    readonly operation: "ASSIGN" | "REMOVE";
  }) {
    const startedAt = performance.now();
    let result;
    try {
      result =
        input.operation === "ASSIGN"
          ? await this.repository.assign({
              workspaceId: input.context.workspaceId,
              projectId: input.projectId,
              projectItemId: input.projectItemId,
              productId: ProductReferenceIdSchema.parse(input.body.productId),
              expectedVersion: input.body.expectedVersion,
            })
          : await this.repository.remove({
              workspaceId: input.context.workspaceId,
              projectId: input.projectId,
              projectItemId: input.projectItemId,
              expectedVersion: input.body.expectedVersion,
            });
    } catch {
      throw new ProjectPersistenceFailureError();
    }
    if (result.state !== "ASSIGNED" && result.state !== "REMOVED") this.failure(result.state);
    this.completed({
      requestId: input.requestId,
      workspaceId: input.context.workspaceId,
      projectId: input.projectId,
      projectItemId: input.projectItemId,
      ...(input.body.productId === undefined ? {} : { productId: input.body.productId }),
      operation: input.operation,
      startedAt,
    });
    return { ...result.result, changed: result.changed };
  }

  async assignAll(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly projectId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "projects.write");
    const projectId = this.projectId(input.projectId);
    const body = ProjectItemProductBulkAssignRequestSchema.parse(input.body);
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.assignAll({
        workspaceId: context.workspaceId,
        projectId,
        productId: body.productId,
        expectedVersion: body.expectedVersion,
      });
    } catch {
      throw new ProjectPersistenceFailureError();
    }
    if (result.state !== "BULK_ASSIGNED") this.failure(result.state);
    this.completed({
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      projectId,
      productId: body.productId,
      operation: "BULK_ASSIGN",
      startedAt,
    });
    return result;
  }
}
