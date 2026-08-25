import { ROLE_PERMISSIONS, type AuthenticatedContext } from "@otshop/shared";
import { describe, expect, it } from "vitest";

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
} from "./project-errors";
import type { ProjectRecord, ProjectRepositoryPort } from "./project-repository";
import { ProjectService } from "./project-service";

const workspaceA = "01941f29-7c00-7000-8000-000000000001";
const workspaceB = "01941f29-7c00-7000-8000-000000000002";
const userId = "01941f29-7c00-7000-8000-000000000003";
const sessionId = "01941f29-7c00-7000-8000-000000000004";
const requestId = "01941f29-7c00-7000-8000-000000000005";
const activeDatasetId = "01941f29-7c00-7000-8000-000000000006";
const emptyDatasetId = "01941f29-7c00-7000-8000-000000000007";
const invalidDatasetId = "01941f29-7c00-7000-8000-000000000008";
const validAccountId = "01941f29-7c00-7000-8000-000000000009";
const invalidAccountId = "01941f29-7c00-7000-8000-00000000000a";
const now = new Date("2026-08-25T14:00:00.000Z");

const context = (workspaceId = workspaceA): AuthenticatedContext => ({
  userId,
  sessionId,
  workspaceId,
  role: "ADMIN",
  permissions: ROLE_PERMISSIONS.ADMIN,
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

class MemoryProjectRepository implements ProjectRepositoryPort {
  readonly projects = new Map<string, ProjectRecord>();
  fail = false;

  private dataset(datasetId: string) {
    return {
      id: datasetId,
      name: datasetId === emptyDatasetId ? "Empty" : "Prepared media",
      status: "ACTIVE",
      itemCount: datasetId === emptyDatasetId ? 0 : 3,
    };
  }

  private persist(project: ProjectRecord, changes: Partial<ProjectRecord>) {
    const updated = { ...project, ...changes, updatedAt: now };
    this.projects.set(updated.id, updated);
    return updated;
  }

  async create(input: Parameters<ProjectRepositoryPort["create"]>[0]) {
    if (this.fail) throw new Error("database detail");
    if (input.datasetId === invalidDatasetId) return { state: "INVALID_DATASET" } as const;
    if (input.accountId === invalidAccountId) return { state: "INVALID_ACCOUNT" } as const;
    if ([...this.projects.values()].some((project) => project.name === input.name)) {
      return { state: "NAME_CONFLICT" } as const;
    }
    const project: ProjectRecord = {
      ...input,
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
      version: 1,
      dataset: this.dataset(input.datasetId),
    };
    this.projects.set(project.id, project);
    return { state: "CREATED", project } as const;
  }

  async findByWorkspaceAndId(workspaceId: string, projectId: string) {
    if (this.fail) throw new Error("database detail");
    const project = this.projects.get(projectId);
    return project?.workspaceId === workspaceId ? project : null;
  }

  async list(input: Parameters<ProjectRepositoryPort["list"]>[0]) {
    if (this.fail) throw new Error("database detail");
    const projects = [...this.projects.values()]
      .filter(({ workspaceId }) => workspaceId === input.workspaceId)
      .filter(({ status }) => input.includeArchived || status !== "ARCHIVED")
      .sort((left, right) => right.id.localeCompare(left.id));
    return { projects: projects.slice(0, input.limit), hasMore: projects.length > input.limit };
  }

  async update(input: Parameters<ProjectRepositoryPort["update"]>[0]) {
    const project = await this.findByWorkspaceAndId(input.workspaceId, input.projectId);
    if (project === null) return { state: "NOT_FOUND" } as const;
    if (project.status === "ARCHIVED") return { state: "ARCHIVED" } as const;
    if (project.status !== "DRAFT") return { state: "NOT_CONFIGURABLE" } as const;
    if (project.version !== input.expectedVersion) return { state: "CONFLICT" } as const;
    if (input.datasetId === invalidDatasetId) return { state: "INVALID_DATASET" } as const;
    if (input.accountId === invalidAccountId) return { state: "INVALID_ACCOUNT" } as const;
    const datasetId = input.datasetId ?? project.datasetId;
    const updated = this.persist(project, {
      ...(input.datasetId === undefined ? {} : { datasetId, dataset: this.dataset(datasetId) }),
      ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.dailyTarget === undefined ? {} : { dailyTarget: input.dailyTarget }),
      ...(input.postingTimezone === undefined ? {} : { postingTimezone: input.postingTimezone }),
      ...(input.postingWindowStart === undefined
        ? {}
        : { postingWindowStart: input.postingWindowStart }),
      ...(input.postingWindowEnd === undefined ? {} : { postingWindowEnd: input.postingWindowEnd }),
      version: project.version + 1,
    });
    return { state: "UPDATED", project: updated } as const;
  }

  async markReady(input: Parameters<ProjectRepositoryPort["markReady"]>[0]) {
    const project = await this.findByWorkspaceAndId(input.workspaceId, input.projectId);
    if (project === null) return { state: "NOT_FOUND" } as const;
    if (project.status === "ARCHIVED") return { state: "ARCHIVED" } as const;
    if (project.version !== input.expectedVersion) return { state: "CONFLICT" } as const;
    if (
      project.status !== "DRAFT" ||
      project.dailyTarget === null ||
      project.dataset.status !== "ACTIVE" ||
      project.dataset.itemCount === 0
    ) {
      return { state: "NOT_CONFIGURABLE" } as const;
    }
    return {
      state: "READY",
      project: this.persist(project, { status: "READY", version: project.version + 1 }),
    } as const;
  }

  async archive(input: Parameters<ProjectRepositoryPort["archive"]>[0]) {
    const project = await this.findByWorkspaceAndId(input.workspaceId, input.projectId);
    if (project === null) return { state: "NOT_FOUND" } as const;
    if (project.status === "ARCHIVED") return { state: "ARCHIVED" } as const;
    if (project.version !== input.expectedVersion) return { state: "CONFLICT" } as const;
    return {
      state: "ARCHIVED",
      project: this.persist(project, { status: "ARCHIVED", version: project.version + 1 }),
    } as const;
  }
}

const setup = () => {
  const repository = new MemoryProjectRepository();
  const service = new ProjectService(repository, logger, () => now);
  return { repository, service };
};

const create = (service: ProjectService, body: Record<string, unknown> = {}) =>
  service.create({
    context: context(),
    requestId,
    body: { name: "Morning catalog", datasetId: activeDatasetId, ...body },
  });

describe("ProjectService", () => {
  it("creates a bounded DRAFT that references, rather than copies, its Dataset", async () => {
    const { repository, service } = setup();
    const project = await create(service, {
      description: "Prepared configuration",
      accountId: validAccountId,
      dailyTarget: 5,
      postingWindow: {
        startLocalTime: "09:00",
        endLocalTime: "21:00",
        timezone: "Asia/Jakarta",
      },
    });
    expect(project).toMatchObject({
      status: "DRAFT",
      version: 1,
      dailyTarget: 5,
      accountId: validAccountId,
      dataset: { id: activeDatasetId, itemCount: 3 },
    });
    expect(repository.projects).toHaveLength(1);
  });

  it("fails closed for permissions, unknown roles, and cross-workspace IDs", async () => {
    const { service } = setup();
    const project = await create(service);
    await expect(
      service.get({ context: context(workspaceB), projectId: project.projectId }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(
      service.get({
        context: { ...context(), permissions: [] },
        projectId: project.projectId,
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.create({
        context: {
          ...context(),
          permissions: ROLE_PERMISSIONS.ADMIN.filter(
            (permission) => permission !== "projects.write",
          ),
        },
        requestId,
        body: { name: "Denied", datasetId: activeDatasetId },
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.create({
        context: { ...context(), role: "UNKNOWN" as "ADMIN" },
        requestId,
        body: { name: "Denied", datasetId: activeDatasetId },
      }),
    ).rejects.toThrow();
    await expect(
      service.get({ context: context(), projectId: "not-a-project-id" }),
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it("rejects unavailable Dataset and account references without revealing tenants", async () => {
    const { service } = setup();
    await expect(create(service, { datasetId: invalidDatasetId })).rejects.toBeInstanceOf(
      ProjectInvalidDatasetError,
    );
    await expect(create(service, { accountId: invalidAccountId })).rejects.toBeInstanceOf(
      ProjectInvalidAccountError,
    );
  });

  it("updates DRAFT configuration with version checks", async () => {
    const { service } = setup();
    const created = await create(service);
    const updated = await service.update({
      context: context(),
      requestId,
      projectId: created.projectId,
      body: { expectedVersion: created.version, description: "Updated", dailyTarget: 5 },
    });
    expect(updated).toMatchObject({ description: "Updated", dailyTarget: 5, version: 2 });
    await expect(
      service.update({
        context: context(),
        requestId,
        projectId: created.projectId,
        body: { expectedVersion: 1, name: "Stale" },
      }),
    ).rejects.toBeInstanceOf(ProjectConflictError);
  });

  it("requires a non-empty active Dataset and daily target before READY", async () => {
    const { service } = setup();
    const incomplete = await create(service);
    await expect(
      service.markReady({
        context: context(),
        requestId,
        projectId: incomplete.projectId,
        body: { expectedVersion: incomplete.version },
      }),
    ).rejects.toBeInstanceOf(ProjectNotConfigurableError);

    const { service: emptyService } = setup();
    const empty = await create(emptyService, { datasetId: emptyDatasetId, dailyTarget: 5 });
    await expect(
      emptyService.markReady({
        context: context(),
        requestId,
        projectId: empty.projectId,
        body: { expectedVersion: empty.version },
      }),
    ).rejects.toBeInstanceOf(ProjectNotConfigurableError);
  });

  it("marks complete configuration READY without creating execution work", async () => {
    const { repository, service } = setup();
    const created = await create(service, { dailyTarget: 5 });
    const ready = await service.markReady({
      context: context(),
      requestId,
      projectId: created.projectId,
      body: { expectedVersion: created.version },
    });
    expect(ready).toMatchObject({ status: "READY", version: 2 });
    expect(repository.projects).toHaveLength(1);
    await expect(
      service.update({
        context: context(),
        requestId,
        projectId: ready.projectId,
        body: { expectedVersion: ready.version, name: "Locked" },
      }),
    ).rejects.toBeInstanceOf(ProjectNotConfigurableError);
  });

  it("archives DRAFT or READY configuration and makes it immutable", async () => {
    const { service } = setup();
    const created = await create(service, { dailyTarget: 5 });
    const archived = await service.archive({
      context: context(),
      requestId,
      projectId: created.projectId,
      body: { expectedVersion: created.version },
    });
    expect(archived).toMatchObject({ status: "ARCHIVED", version: 2 });
    await expect(
      service.archive({
        context: context(),
        requestId,
        projectId: archived.projectId,
        body: { expectedVersion: archived.version },
      }),
    ).rejects.toBeInstanceOf(ProjectArchivedError);
  });

  it("accepts default and maximum pages and validates pagination before repository access", async () => {
    const { repository, service } = setup();
    await create(service);
    await expect(service.list({ context: context() })).resolves.toMatchObject({
      projects: expect.any(Array),
    });
    await expect(service.list({ context: context(), limit: "100" })).resolves.toMatchObject({
      projects: expect.any(Array),
    });
    repository.fail = true;
    await expect(service.list({ context: context(), limit: "101" })).rejects.toBeInstanceOf(
      InvalidProjectPaginationError,
    );
    await expect(service.list({ context: context(), cursor: "***" })).rejects.toBeInstanceOf(
      InvalidProjectPaginationError,
    );
  });
});
