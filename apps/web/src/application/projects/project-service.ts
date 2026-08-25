import { z } from "zod";

import {
  AuthenticatedContextSchema,
  PROJECT_DEFAULT_PAGE_SIZE,
  PROJECT_MAX_PAGE_SIZE,
  ProjectCreateRequestSchema,
  ProjectIdSchema,
  ProjectUpdateRequestSchema,
  ProjectVersionRequestSchema,
  createUuidV7,
  hasPermission,
  type AuthenticatedContext,
  type Permission,
  type RequestId,
} from "@otshop/shared";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import {
  InvalidProjectPaginationError,
  ProjectArchivedError,
  ProjectConflictError,
  ProjectInvalidAccountError,
  ProjectInvalidDatasetError,
  ProjectNotConfigurableError,
  ProjectNotFoundError,
  ProjectPersistenceFailureError,
} from "./project-errors";
import type {
  ProjectMutationFailure,
  ProjectRecord,
  ProjectRepositoryPort,
} from "./project-repository";

const projectCursorSchema = z.object({ createdAt: z.iso.datetime(), id: ProjectIdSchema }).strict();

const encodeCursor = (value: object): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodeCursor = (value: string | undefined) => {
  if (value === undefined) return undefined;
  if (value.length === 0 || value.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new InvalidProjectPaginationError();
  }
  try {
    return projectCursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new InvalidProjectPaginationError();
  }
};

const pageSize = (value: string | undefined): number => {
  if (value === undefined) return PROJECT_DEFAULT_PAGE_SIZE;
  if (!/^[1-9][0-9]*$/u.test(value)) throw new InvalidProjectPaginationError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > PROJECT_MAX_PAGE_SIZE) {
    throw new InvalidProjectPaginationError();
  }
  return parsed;
};

const publicProject = (project: ProjectRecord) => ({
  projectId: project.id,
  name: project.name,
  description: project.description,
  status: project.status,
  version: project.version,
  dataset: project.dataset,
  accountId: project.accountId,
  dailyTarget: project.dailyTarget,
  postingWindow:
    project.postingTimezone === null ||
    project.postingWindowStart === null ||
    project.postingWindowEnd === null
      ? null
      : {
          startLocalTime: project.postingWindowStart,
          endLocalTime: project.postingWindowEnd,
          timezone: project.postingTimezone,
        },
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
});

export class ProjectService {
  constructor(
    private readonly repository: ProjectRepositoryPort,
    private readonly log: ApplicationLogger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private authorize(context: AuthenticatedContext, permission: Permission): AuthenticatedContext {
    const canonical = AuthenticatedContextSchema.parse(context);
    if (!hasPermission(canonical.role, permission) || !canonical.permissions.includes(permission)) {
      throw new AuthorizationDeniedError();
    }
    return canonical;
  }

  private mutationFailure(state: ProjectMutationFailure): never {
    if (state === "NOT_FOUND") throw new ProjectNotFoundError();
    if (state === "ARCHIVED") throw new ProjectArchivedError();
    if (state === "INVALID_DATASET") throw new ProjectInvalidDatasetError();
    if (state === "INVALID_ACCOUNT") throw new ProjectInvalidAccountError();
    if (state === "NOT_CONFIGURABLE") throw new ProjectNotConfigurableError();
    throw new ProjectConflictError();
  }

  private logMutation(input: {
    readonly requestId: RequestId;
    readonly workspaceId: string;
    readonly projectId: string;
    readonly datasetId?: string;
    readonly operation: "ARCHIVE" | "CREATE" | "READY" | "UPDATE";
    readonly startedAt: number;
  }) {
    this.log.info("project.mutation.completed", {
      requestId: input.requestId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      ...(input.datasetId === undefined ? {} : { datasetId: input.datasetId }),
      operation: input.operation,
      result: "SUCCESS",
      durationMs: Math.round(performance.now() - input.startedAt),
    });
  }

  async create(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "projects.write");
    const body = ProjectCreateRequestSchema.parse(input.body);
    const projectId = ProjectIdSchema.parse(createUuidV7(this.clock().getTime()));
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.create({
        id: projectId,
        workspaceId: context.workspaceId,
        createdByUserId: context.userId,
        datasetId: body.datasetId,
        accountId: body.accountId ?? null,
        name: body.name,
        description: body.description ?? null,
        dailyTarget: body.dailyTarget ?? null,
        postingTimezone: body.postingWindow?.timezone ?? null,
        postingWindowStart: body.postingWindow?.startLocalTime ?? null,
        postingWindowEnd: body.postingWindow?.endLocalTime ?? null,
      });
    } catch {
      throw new ProjectPersistenceFailureError();
    }
    if (result.state === "NAME_CONFLICT") throw new ProjectConflictError();
    if (result.state === "INVALID_DATASET") throw new ProjectInvalidDatasetError();
    if (result.state === "INVALID_ACCOUNT") throw new ProjectInvalidAccountError();
    if (result.state !== "CREATED") throw new ProjectPersistenceFailureError();
    this.logMutation({
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      projectId,
      datasetId: result.project.datasetId,
      operation: "CREATE",
      startedAt,
    });
    return publicProject(result.project);
  }

  async list(input: {
    readonly context: AuthenticatedContext;
    readonly limit?: string;
    readonly cursor?: string;
    readonly includeArchived?: string;
  }) {
    const context = this.authorize(input.context, "projects.read");
    if (input.includeArchived !== undefined && !["true", "false"].includes(input.includeArchived)) {
      throw new InvalidProjectPaginationError();
    }
    const limit = pageSize(input.limit);
    const before = decodeCursor(input.cursor);
    let page;
    try {
      page = await this.repository.list({
        workspaceId: context.workspaceId,
        includeArchived: input.includeArchived === "true",
        limit,
        ...(before === undefined
          ? {}
          : { before: { createdAt: new Date(before.createdAt), id: before.id } }),
      });
    } catch {
      throw new ProjectPersistenceFailureError();
    }
    const last = page.projects.at(-1);
    return {
      projects: page.projects.map(publicProject),
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  async get(input: { readonly context: AuthenticatedContext; readonly projectId: string }) {
    const context = this.authorize(input.context, "projects.read");
    const projectId = ProjectIdSchema.safeParse(input.projectId);
    if (!projectId.success) throw new ProjectNotFoundError();
    let project;
    try {
      project = await this.repository.findByWorkspaceAndId(context.workspaceId, projectId.data);
    } catch {
      throw new ProjectPersistenceFailureError();
    }
    if (project === null) throw new ProjectNotFoundError();
    return publicProject(project);
  }

  async update(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly projectId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "projects.write");
    const projectId = ProjectIdSchema.safeParse(input.projectId);
    if (!projectId.success) throw new ProjectNotFoundError();
    const body = ProjectUpdateRequestSchema.parse(input.body);
    const startedAt = performance.now();
    const postingWindowProvided = Object.hasOwn(body, "postingWindow");
    let result;
    try {
      result = await this.repository.update({
        workspaceId: context.workspaceId,
        projectId: projectId.data,
        expectedVersion: body.expectedVersion,
        ...(body.datasetId === undefined ? {} : { datasetId: body.datasetId }),
        ...(Object.hasOwn(body, "accountId") ? { accountId: body.accountId ?? null } : {}),
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(Object.hasOwn(body, "description") ? { description: body.description ?? null } : {}),
        ...(Object.hasOwn(body, "dailyTarget") ? { dailyTarget: body.dailyTarget ?? null } : {}),
        ...(postingWindowProvided
          ? {
              postingTimezone: body.postingWindow?.timezone ?? null,
              postingWindowStart: body.postingWindow?.startLocalTime ?? null,
              postingWindowEnd: body.postingWindow?.endLocalTime ?? null,
            }
          : {}),
      });
    } catch {
      throw new ProjectPersistenceFailureError();
    }
    if (result.state === "NAME_CONFLICT") throw new ProjectConflictError();
    if (result.state !== "UPDATED") this.mutationFailure(result.state);
    this.logMutation({
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      projectId: projectId.data,
      datasetId: result.project.datasetId,
      operation: "UPDATE",
      startedAt,
    });
    return publicProject(result.project);
  }

  async markReady(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly projectId: string;
    readonly body: unknown;
  }) {
    return this.transition(input, "READY");
  }

  async archive(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly projectId: string;
    readonly body: unknown;
  }) {
    return this.transition(input, "ARCHIVE");
  }

  private async transition(
    input: {
      readonly context: AuthenticatedContext;
      readonly requestId: RequestId;
      readonly projectId: string;
      readonly body: unknown;
    },
    operation: "ARCHIVE" | "READY",
  ) {
    const context = this.authorize(input.context, "projects.write");
    const projectId = ProjectIdSchema.safeParse(input.projectId);
    if (!projectId.success) throw new ProjectNotFoundError();
    const body = ProjectVersionRequestSchema.parse(input.body);
    const startedAt = performance.now();
    let result;
    try {
      result =
        operation === "READY"
          ? await this.repository.markReady({
              workspaceId: context.workspaceId,
              projectId: projectId.data,
              expectedVersion: body.expectedVersion,
            })
          : await this.repository.archive({
              workspaceId: context.workspaceId,
              projectId: projectId.data,
              expectedVersion: body.expectedVersion,
            });
    } catch {
      throw new ProjectPersistenceFailureError();
    }
    const expectedState = operation === "READY" ? "READY" : "ARCHIVED";
    if (result.state !== expectedState || !("project" in result)) {
      this.mutationFailure(result.state as ProjectMutationFailure);
    }
    this.logMutation({
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      projectId: projectId.data,
      datasetId: result.project.datasetId,
      operation,
      startedAt,
    });
    return publicProject(result.project);
  }
}
