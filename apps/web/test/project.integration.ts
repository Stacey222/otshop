import { ProjectRepository, getDatabaseClient } from "@otshop/database";
import { ROLE_PERMISSIONS, createUuidV7, type AuthenticatedContext } from "@otshop/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ProjectService } from "../src/application/projects/project-service";
import type { ApplicationLogger } from "../src/infrastructure/logging/logger";

const prisma = getDatabaseClient();
const clock = () => new Date("2026-08-25T14:30:00.000Z");
let sequence = 0;
const id = () => createUuidV7(clock().getTime() + sequence++);
const requestId = id();
const tenantA = { userId: id(), organizationId: id(), workspaceId: id(), sessionId: id() };
const tenantB = { userId: id(), organizationId: id(), workspaceId: id(), sessionId: id() };
const readyMediaA = id();
const readyMediaB = id();
const ingestedMediaA = id();
const datasetActiveA = id();
const datasetEmptyA = id();
const datasetArchivedA = id();
const datasetIneligibleA = id();
const datasetActiveB = id();
const accountA = id();
const accountB = id();

const logger: ApplicationLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  withContext() {
    return this;
  },
};

const service = new ProjectService(new ProjectRepository(prisma), logger, clock);

const context = (tenant = tenantA): AuthenticatedContext => ({
  userId: tenant.userId,
  sessionId: tenant.sessionId,
  workspaceId: tenant.workspaceId,
  role: "ADMIN",
  permissions: ROLE_PERMISSIONS.ADMIN,
});

async function seedTenant(tenant: typeof tenantA, suffix: string) {
  await prisma.user.create({
    data: {
      id: tenant.userId,
      email: `project-${suffix}@example.test`,
      displayName: `Project ${suffix}`,
      status: "ACTIVE",
    },
  });
  await prisma.organization.create({
    data: {
      id: tenant.organizationId,
      name: `Project ${suffix}`,
      slug: `project-${suffix}`,
      status: "ACTIVE",
    },
  });
  await prisma.workspace.create({
    data: {
      id: tenant.workspaceId,
      organizationId: tenant.organizationId,
      name: `Project ${suffix}`,
      slug: `project-${suffix}`,
      timezone: "Asia/Jakarta",
      status: "ACTIVE",
    },
  });
}

async function seedMedia(mediaId: string, workspaceId: string, marker: number, status = "READY") {
  await prisma.mediaAsset.create({
    data: {
      id: mediaId,
      workspaceId,
      source: "MANUAL_UPLOAD",
      originalFilename: `project-${marker}.mp4`,
      storageKey: `original/workspace/${workspaceId}/project/${marker}.mp4`,
      mimeType: "video/mp4",
      sizeBytes: 100n,
      sha256: Buffer.alloc(32, marker),
      status,
      ...(status === "READY"
        ? {
            durationMs: 10_000n,
            width: 1920,
            height: 1080,
            fps: 25,
            bitrateBps: 1_000_000n,
            codec: "h264",
            audioCodec: "aac",
            orientation: "ROTATION_0",
          }
        : {}),
    },
  });
}

beforeAll(async () => {
  await seedTenant(tenantA, `a-${tenantA.workspaceId.slice(-6)}`);
  await seedTenant(tenantB, `b-${tenantB.workspaceId.slice(-6)}`);
  await seedMedia(readyMediaA, tenantA.workspaceId, 71);
  await seedMedia(readyMediaB, tenantB.workspaceId, 72);
  await seedMedia(ingestedMediaA, tenantA.workspaceId, 73, "INGESTED");
  for (const [datasetId, workspaceId, userId, name, status] of [
    [datasetActiveA, tenantA.workspaceId, tenantA.userId, "Project active A", "ACTIVE"],
    [datasetEmptyA, tenantA.workspaceId, tenantA.userId, "Project empty A", "ACTIVE"],
    [datasetArchivedA, tenantA.workspaceId, tenantA.userId, "Project archived A", "ARCHIVED"],
    [datasetIneligibleA, tenantA.workspaceId, tenantA.userId, "Project ineligible A", "ACTIVE"],
    [datasetActiveB, tenantB.workspaceId, tenantB.userId, "Project active B", "ACTIVE"],
  ] as const) {
    await prisma.dataset.create({
      data: { id: datasetId, workspaceId, createdByUserId: userId, name, status },
    });
  }
  await prisma.datasetItem.createMany({
    data: [
      {
        id: id(),
        workspaceId: tenantA.workspaceId,
        datasetId: datasetActiveA,
        mediaAssetId: readyMediaA,
        position: 0,
      },
      {
        id: id(),
        workspaceId: tenantB.workspaceId,
        datasetId: datasetActiveB,
        mediaAssetId: readyMediaB,
        position: 0,
      },
      {
        id: id(),
        workspaceId: tenantA.workspaceId,
        datasetId: datasetIneligibleA,
        mediaAssetId: ingestedMediaA,
        position: 0,
      },
    ],
  });
  await prisma.shopeeAccount.createMany({
    data: [
      {
        id: accountA,
        workspaceId: tenantA.workspaceId,
        displayName: "Future account A",
        countryCode: "ID",
        status: "ACTIVE",
      },
      {
        id: accountB,
        workspaceId: tenantB.workspaceId,
        displayName: "Future account B",
        countryCode: "ID",
        status: "ACTIVE",
      },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const createProject = (name: string, body: Record<string, unknown> = {}) =>
  service.create({
    context: context(),
    requestId,
    body: { name, datasetId: datasetActiveA, ...body },
  });

describe("database-backed project configuration foundation", () => {
  it("creates, reads, updates, validates READY, and archives without execution work", async () => {
    let project = await createProject("Project lifecycle", {
      accountId: accountA,
      dailyTarget: 5,
      postingWindow: {
        startLocalTime: "09:00",
        endLocalTime: "21:00",
        timezone: "Asia/Jakarta",
      },
    });
    expect(project).toMatchObject({
      status: "DRAFT",
      dataset: { id: datasetActiveA, itemCount: 1 },
    });
    project = await service.update({
      context: context(),
      requestId,
      projectId: project.projectId,
      body: { expectedVersion: project.version, description: "Local configuration" },
    });
    project = await service.markReady({
      context: context(),
      requestId,
      projectId: project.projectId,
      body: { expectedVersion: project.version },
    });
    expect(project.status).toBe("READY");
    expect(await prisma.projectItem.count({ where: { projectId: project.projectId } })).toBe(0);
    expect(await prisma.publishJob.count({ where: { projectId: project.projectId } })).toBe(0);
    expect(
      await prisma.schedule.count({ where: { projects: { some: { id: project.projectId } } } }),
    ).toBe(0);
    project = await service.archive({
      context: context(),
      requestId,
      projectId: project.projectId,
      body: { expectedVersion: project.version },
    });
    expect(project.status).toBe("ARCHIVED");
    await expect(
      service.update({
        context: context(),
        requestId,
        projectId: project.projectId,
        body: { expectedVersion: project.version, name: "Forbidden archive mutation" },
      }),
    ).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
  });

  it("fails closed for archived, missing, and cross-workspace Dataset/account references", async () => {
    await expect(
      createProject("Archived dataset project", { datasetId: datasetArchivedA }),
    ).rejects.toMatchObject({
      code: "PROJECT_INVALID_DATASET",
    });
    await expect(
      createProject("Foreign dataset project", { datasetId: datasetActiveB }),
    ).rejects.toMatchObject({
      code: "PROJECT_INVALID_DATASET",
    });
    await expect(
      createProject("Foreign account project", { accountId: accountB }),
    ).rejects.toMatchObject({
      code: "PROJECT_INVALID_ACCOUNT",
    });
    const project = await createProject("Tenant hidden project");
    await expect(
      service.get({ context: context(tenantB), projectId: project.projectId }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });

  it("rejects READY for an empty Dataset and accepts nullable account honestly", async () => {
    const empty = await createProject("Empty dataset project", {
      datasetId: datasetEmptyA,
      dailyTarget: 5,
    });
    await expect(
      service.markReady({
        context: context(),
        requestId,
        projectId: empty.projectId,
        body: { expectedVersion: empty.version },
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_CONFIGURABLE" });
    const ineligible = await createProject("Ineligible dataset project", {
      datasetId: datasetIneligibleA,
      dailyTarget: 5,
    });
    await expect(
      service.markReady({
        context: context(),
        requestId,
        projectId: ineligible.projectId,
        body: { expectedVersion: ineligible.version },
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_CONFIGURABLE" });
    const noAccount = await createProject("No account required project", { dailyTarget: 5 });
    await expect(
      service.markReady({
        context: context(),
        requestId,
        projectId: noAccount.projectId,
        body: { expectedVersion: noAccount.version },
      }),
    ).resolves.toMatchObject({ status: "READY", accountId: null });
  });

  it("revalidates persisted IANA timezone policy at the READY boundary", async () => {
    const project = await createProject("Invalid persisted timezone", { dailyTarget: 5 });
    await prisma.project.update({
      where: { id: project.projectId },
      data: {
        postingTimezone: "Invalid/Timezone",
        postingWindowStart: "09:00",
        postingWindowEnd: "21:00",
      },
    });
    await expect(
      service.markReady({
        context: context(),
        requestId,
        projectId: project.projectId,
        body: { expectedVersion: project.version },
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_CONFIGURABLE" });
  });

  it("paginates with stable opaque keyset cursors", async () => {
    await createProject("Project pagination A");
    await createProject("Project pagination B");
    await createProject("Project pagination C");
    const first = await service.list({ context: context(), limit: "2", includeArchived: "true" });
    expect(first.projects).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await service.list({
      context: context(),
      limit: "2",
      cursor: first.nextCursor!,
      includeArchived: "true",
    });
    const firstIds = new Set(first.projects.map(({ projectId }) => projectId));
    expect(second.projects.some(({ projectId }) => firstIds.has(projectId))).toBe(false);
  });

  it("allows one winner for same-version updates", async () => {
    const project = await createProject("Project update race");
    const outcomes = await Promise.allSettled([
      service.update({
        context: context(),
        requestId,
        projectId: project.projectId,
        body: { expectedVersion: project.version, name: "Project update race A" },
      }),
      service.update({
        context: context(),
        requestId,
        projectId: project.projectId,
        body: { expectedVersion: project.version, name: "Project update race B" },
      }),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  });

  it("serializes update against archive", async () => {
    const project = await createProject("Project archive race");
    const outcomes = await Promise.allSettled([
      service.update({
        context: context(),
        requestId,
        projectId: project.projectId,
        body: { expectedVersion: project.version, description: "Update winner" },
      }),
      service.archive({
        context: context(),
        requestId,
        projectId: project.projectId,
        body: { expectedVersion: project.version },
      }),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const persisted = await prisma.project.findUniqueOrThrow({ where: { id: project.projectId } });
    expect(persisted.version).toBe(project.version + 1);
  });

  it("serializes READY against update without creating jobs", async () => {
    const project = await createProject("Project ready race", { dailyTarget: 5 });
    const outcomes = await Promise.allSettled([
      service.markReady({
        context: context(),
        requestId,
        projectId: project.projectId,
        body: { expectedVersion: project.version },
      }),
      service.update({
        context: context(),
        requestId,
        projectId: project.projectId,
        body: { expectedVersion: project.version, description: "Concurrent update" },
      }),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(await prisma.publishJob.count({ where: { projectId: project.projectId } })).toBe(0);
  });

  it("enforces lifecycle, daily-target, window, and workspace constraints in PostgreSQL", async () => {
    const project = await createProject("Project database constraints");
    await expect(
      prisma.project.update({ where: { id: project.projectId }, data: { status: "UNKNOWN" } }),
    ).rejects.toThrow();
    await expect(
      prisma.project.update({ where: { id: project.projectId }, data: { dailyTarget: 51 } }),
    ).rejects.toThrow();
    await expect(
      prisma.project.update({
        where: { id: project.projectId },
        data: {
          postingTimezone: "Asia/Jakarta",
          postingWindowStart: "21:00",
          postingWindowEnd: "09:00",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.project.update({
        where: { id: project.projectId },
        data: { datasetId: datasetActiveB },
      }),
    ).rejects.toThrow();
  });
});
