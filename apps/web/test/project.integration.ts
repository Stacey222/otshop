import {
  DatasetRepository,
  ProjectItemRepository,
  ProjectRepository,
  getDatabaseClient,
} from "@otshop/database";
import { ROLE_PERMISSIONS, createUuidV7, type AuthenticatedContext } from "@otshop/shared";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ProjectService } from "../src/application/projects/project-service";
import { ProjectItemService } from "../src/application/projects/project-item-service";
import { POST as materializeRoute } from "../src/app/api/projects/[projectId]/items/materialize/route";
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
const itemService = new ProjectItemService(new ProjectItemRepository(prisma, clock), logger);
const datasetRepository = new DatasetRepository(prisma);

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

async function createMaterializationFixture(name: string, itemCount = 3) {
  const datasetId = id();
  await prisma.dataset.create({
    data: {
      id: datasetId,
      workspaceId: tenantA.workspaceId,
      createdByUserId: tenantA.userId,
      name,
      status: "ACTIVE",
    },
  });
  const items: { id: string; mediaAssetId: string; position: number }[] = [];
  for (let position = 0; position < itemCount; position += 1) {
    const mediaAssetId = id();
    await seedMedia(mediaAssetId, tenantA.workspaceId, 100 + sequence);
    items.push({ id: id(), mediaAssetId, position });
  }
  await prisma.datasetItem.createMany({
    data: items.map((item) => ({ ...item, workspaceId: tenantA.workspaceId, datasetId })),
  });
  const project = await createProject(`${name} project`, { datasetId, dailyTarget: 5 });
  return { datasetId, items, project };
}

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
    const materialized = await itemService.materialize({
      context: context(),
      requestId,
      projectId: project.projectId,
      body: { expectedVersion: project.version },
    });
    project = await service.markReady({
      context: context(),
      requestId,
      projectId: project.projectId,
      body: { expectedVersion: materialized.projectVersion },
    });
    expect(project.status).toBe("READY");
    expect(await prisma.projectItem.count({ where: { projectId: project.projectId } })).toBe(1);
    expect(await prisma.publishJob.count({ where: { projectId: project.projectId } })).toBe(0);
    expect(
      await prisma.schedule.count({ where: { projects: { some: { id: project.projectId } } } }),
    ).toBe(0);
    await expect(
      itemService.materialize({
        context: context(),
        requestId,
        projectId: project.projectId,
        body: { expectedVersion: project.version },
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_CONFIGURABLE" });
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
    const noAccountItems = await itemService.materialize({
      context: context(),
      requestId,
      projectId: noAccount.projectId,
      body: { expectedVersion: noAccount.version },
    });
    await expect(
      service.markReady({
        context: context(),
        requestId,
        projectId: noAccount.projectId,
        body: { expectedVersion: noAccountItems.projectVersion },
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
    const materialized = await itemService.materialize({
      context: context(),
      requestId,
      projectId: project.projectId,
      body: { expectedVersion: project.version },
    });
    const outcomes = await Promise.allSettled([
      service.markReady({
        context: context(),
        requestId,
        projectId: project.projectId,
        body: { expectedVersion: materialized.projectVersion },
      }),
      service.update({
        context: context(),
        requestId,
        projectId: project.projectId,
        body: { expectedVersion: materialized.projectVersion, description: "Concurrent update" },
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

describe("database-backed ProjectItem materialization", () => {
  it("requires authentication and fails closed for cross-workspace project identifiers", async () => {
    const fixture = await createMaterializationFixture("Materialization authorization", 1);
    const response = await materializeRoute(
      new NextRequest(
        `http://localhost:3000/api/projects/${fixture.project.projectId}/items/materialize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
          body: JSON.stringify({ expectedVersion: fixture.project.version }),
        },
      ),
      { params: Promise.resolve({ projectId: fixture.project.projectId }) },
    );
    expect(response.status).toBe(401);
    await expect(
      itemService.materialize({
        context: context(tenantB),
        requestId,
        projectId: fixture.project.projectId,
        body: { expectedVersion: fixture.project.version },
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });

  it("materializes canonical order idempotently without downstream execution records", async () => {
    const fixture = await createMaterializationFixture("Materialization idempotency");
    const first = await itemService.materialize({
      context: context(),
      requestId,
      projectId: fixture.project.projectId,
      body: { expectedVersion: fixture.project.version },
    });
    expect(first).toMatchObject({
      changed: true,
      createdCount: 3,
      itemCount: 3,
      projectVersion: fixture.project.version + 1,
    });
    const identifiers = (
      await prisma.projectItem.findMany({
        where: { projectId: fixture.project.projectId },
        orderBy: { position: "asc" },
      })
    ).map(({ id, datasetItemId, mediaAssetId, position }) => ({
      id,
      datasetItemId,
      mediaAssetId,
      position,
    }));
    expect(identifiers.map(({ datasetItemId }) => datasetItemId)).toEqual(
      fixture.items.map(({ id: datasetItemId }) => datasetItemId),
    );
    await expect(
      itemService.materialize({
        context: context(),
        requestId,
        projectId: fixture.project.projectId,
        body: { expectedVersion: first.projectVersion },
      }),
    ).resolves.toMatchObject({ changed: false, projectVersion: first.projectVersion });
    expect(
      (
        await prisma.projectItem.findMany({
          where: { projectId: fixture.project.projectId },
          orderBy: { position: "asc" },
        })
      ).map(({ id, datasetItemId, mediaAssetId, position }) => ({
        id,
        datasetItemId,
        mediaAssetId,
        position,
      })),
    ).toEqual(identifiers);
    expect(
      await prisma.projectItemProduct.count({
        where: { projectItem: { projectId: fixture.project.projectId } },
      }),
    ).toBe(0);
    expect(await prisma.publishJob.count({ where: { projectId: fixture.project.projectId } })).toBe(
      0,
    );
    expect(await prisma.scheduleRun.count()).toBe(0);
    await expect(
      prisma.projectItem.update({
        where: { id: identifiers[0]!.id },
        data: { status: "UNKNOWN" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.projectItem.update({
        where: { id: identifiers[0]!.id },
        data: { position: -1 },
      }),
    ).rejects.toThrow();
  });

  it("reconciles Dataset order deterministically and requires materialization before READY", async () => {
    const fixture = await createMaterializationFixture("Materialization reorder");
    await expect(
      service.markReady({
        context: context(),
        requestId,
        projectId: fixture.project.projectId,
        body: { expectedVersion: fixture.project.version },
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_CONFIGURABLE" });
    const first = await itemService.materialize({
      context: context(),
      requestId,
      projectId: fixture.project.projectId,
      body: { expectedVersion: fixture.project.version },
    });
    const reversed = [...fixture.items].reverse().map(({ id: itemId }) => itemId);
    const race = await Promise.allSettled([
      datasetRepository.reorder({
        workspaceId: tenantA.workspaceId,
        datasetId: fixture.datasetId,
        itemIds: reversed,
        expectedVersion: 1,
      }),
      itemService.materialize({
        context: context(),
        requestId,
        projectId: fixture.project.projectId,
        body: { expectedVersion: first.projectVersion },
      }),
    ]);
    expect(race.some(({ status }) => status === "fulfilled")).toBe(true);
    const datasetAfterRace = await prisma.dataset.findUniqueOrThrow({
      where: { id: fixture.datasetId },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (datasetAfterRace.items.map(({ id: itemId }) => itemId).join() !== reversed.join()) {
      await expect(
        datasetRepository.reorder({
          workspaceId: tenantA.workspaceId,
          datasetId: fixture.datasetId,
          itemIds: reversed,
          expectedVersion: datasetAfterRace.version,
        }),
      ).resolves.toMatchObject({ state: "REORDERED" });
    }
    const current = await prisma.project.findUniqueOrThrow({
      where: { id: fixture.project.projectId },
    });
    await expect(
      itemService.materialize({
        context: context(),
        requestId,
        projectId: fixture.project.projectId,
        body: { expectedVersion: current.version },
      }),
    ).resolves.toMatchObject({ changed: true, reorderedCount: 2 });
    expect(
      (
        await prisma.projectItem.findMany({
          where: { projectId: fixture.project.projectId },
          orderBy: { position: "asc" },
        })
      ).map(({ datasetItemId }) => datasetItemId),
    ).toEqual(reversed);
  });

  it("allows one winner for simultaneous materializations and stale Project versions", async () => {
    const fixture = await createMaterializationFixture("Materialization race");
    const outcomes = await Promise.allSettled([
      itemService.materialize({
        context: context(),
        requestId,
        projectId: fixture.project.projectId,
        body: { expectedVersion: fixture.project.version },
      }),
      itemService.materialize({
        context: context(),
        requestId,
        projectId: fixture.project.projectId,
        body: { expectedVersion: fixture.project.version },
      }),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.projectItem.count({ where: { projectId: fixture.project.projectId } }),
    ).toBe(fixture.items.length);
    const sourceIds = (
      await prisma.projectItem.findMany({
        where: { projectId: fixture.project.projectId },
        select: { datasetItemId: true },
      })
    ).map(({ datasetItemId }) => datasetItemId);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
  });

  it("reconciles a DRAFT Project Dataset switch by replacing only pristine materialization", async () => {
    const original = await createMaterializationFixture("Materialization dataset switch A", 2);
    const replacement = await createMaterializationFixture("Materialization dataset switch B", 2);
    const first = await itemService.materialize({
      context: context(),
      requestId,
      projectId: original.project.projectId,
      body: { expectedVersion: original.project.version },
    });
    const updated = await service.update({
      context: context(),
      requestId,
      projectId: original.project.projectId,
      body: { expectedVersion: first.projectVersion, datasetId: replacement.datasetId },
    });
    await expect(
      itemService.materialize({
        context: context(),
        requestId,
        projectId: original.project.projectId,
        body: { expectedVersion: updated.version },
      }),
    ).resolves.toMatchObject({ createdCount: 2, removedCount: 2, itemCount: 2 });
    expect(
      (
        await prisma.projectItem.findMany({
          where: { projectId: original.project.projectId },
          orderBy: { position: "asc" },
        })
      ).map(({ datasetItemId }) => datasetItemId),
    ).toEqual(replacement.items.map(({ id: datasetItemId }) => datasetItemId));
  });

  it("converges after concurrent Dataset mutation and materialization", async () => {
    const fixture = await createMaterializationFixture("Materialization dataset race", 2);
    const newMediaId = id();
    const newItemId = id();
    await seedMedia(newMediaId, tenantA.workspaceId, 180);
    await Promise.allSettled([
      datasetRepository.addItem({
        id: newItemId,
        workspaceId: tenantA.workspaceId,
        datasetId: fixture.datasetId,
        mediaAssetId: newMediaId,
        captionOverride: null,
        expectedVersion: 1,
        maximumItems: 1_000,
      }),
      itemService.materialize({
        context: context(),
        requestId,
        projectId: fixture.project.projectId,
        body: { expectedVersion: fixture.project.version },
      }),
    ]);
    const current = await prisma.project.findUniqueOrThrow({
      where: { id: fixture.project.projectId },
    });
    await itemService.materialize({
      context: context(),
      requestId,
      projectId: fixture.project.projectId,
      body: { expectedVersion: current.version },
    });
    const [sources, materialized] = await Promise.all([
      prisma.datasetItem.findMany({
        where: { datasetId: fixture.datasetId },
        orderBy: { position: "asc" },
      }),
      prisma.projectItem.findMany({
        where: { projectId: fixture.project.projectId },
        orderBy: { position: "asc" },
      }),
    ]);
    expect(
      materialized.map(({ datasetItemId, mediaAssetId, position }) => ({
        datasetItemId,
        mediaAssetId,
        position,
      })),
    ).toEqual(
      sources.map(({ id: datasetItemId, mediaAssetId, position }) => ({
        datasetItemId,
        mediaAssetId,
        position,
      })),
    );
  });

  it("prunes only pristine DRAFT materialization and blocks configured data loss", async () => {
    const removable = await createMaterializationFixture("Materialization safe removal", 2);
    const first = await itemService.materialize({
      context: context(),
      requestId,
      projectId: removable.project.projectId,
      body: { expectedVersion: removable.project.version },
    });
    await expect(
      datasetRepository.removeItem({
        workspaceId: tenantA.workspaceId,
        datasetId: removable.datasetId,
        itemId: removable.items[0]!.id,
        expectedVersion: 1,
      }),
    ).resolves.toMatchObject({ state: "REMOVED" });
    await expect(
      itemService.materialize({
        context: context(),
        requestId,
        projectId: removable.project.projectId,
        body: { expectedVersion: first.projectVersion },
      }),
    ).resolves.toMatchObject({ changed: true, itemCount: 1 });

    const protectedFixture = await createMaterializationFixture(
      "Materialization protected removal",
      1,
    );
    await itemService.materialize({
      context: context(),
      requestId,
      projectId: protectedFixture.project.projectId,
      body: { expectedVersion: protectedFixture.project.version },
    });
    await prisma.projectItem.updateMany({
      where: { projectId: protectedFixture.project.projectId },
      data: { caption: "future configured caption" },
    });
    await expect(
      datasetRepository.removeItem({
        workspaceId: tenantA.workspaceId,
        datasetId: protectedFixture.datasetId,
        itemId: protectedFixture.items[0]!.id,
        expectedVersion: 1,
      }),
    ).resolves.toEqual({ state: "PROJECT_ITEM_CONFLICT" });
    expect(
      await prisma.datasetItem.count({ where: { datasetId: protectedFixture.datasetId } }),
    ).toBe(1);
    expect(
      await prisma.projectItem.count({ where: { projectId: protectedFixture.project.projectId } }),
    ).toBe(1);
  });
});
