import { DatasetRepository, getDatabaseClient } from "@otshop/database";
import { ROLE_PERMISSIONS, createUuidV7, type AuthenticatedContext } from "@otshop/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DatasetService } from "../src/application/datasets/dataset-service";
import type { ApplicationLogger } from "../src/infrastructure/logging/logger";

const prisma = getDatabaseClient();
const repository = new DatasetRepository(prisma);
const logger: ApplicationLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  withContext() {
    return this;
  },
};
const clock = () => new Date("2026-08-25T07:00:00.000Z");
const service = new DatasetService(repository, logger, clock);
let sequence = 0;
const id = () => createUuidV7(clock().getTime() + sequence++);
const requestId = id();

const tenantA = { userId: id(), organizationId: id(), workspaceId: id(), sessionId: id() };
const tenantB = { userId: id(), organizationId: id(), workspaceId: id(), sessionId: id() };
const mediaReadyA = id();
const mediaReadyA2 = id();
const mediaReadyA3 = id();
const mediaIngestedA = id();
const mediaReadyB = id();

const context = (tenant = tenantA): AuthenticatedContext => ({
  userId: tenant.userId,
  sessionId: tenant.sessionId,
  workspaceId: tenant.workspaceId,
  role: "ADMIN",
  permissions: ROLE_PERMISSIONS.ADMIN,
});

async function seedTenant(tenant: typeof tenantA, suffix: string): Promise<void> {
  await prisma.user.create({
    data: {
      id: tenant.userId,
      email: `dataset-${suffix}@example.test`,
      displayName: `Dataset ${suffix}`,
      status: "ACTIVE",
    },
  });
  await prisma.organization.create({
    data: {
      id: tenant.organizationId,
      name: `Dataset ${suffix}`,
      slug: `dataset-${suffix}`,
      status: "ACTIVE",
    },
  });
  await prisma.workspace.create({
    data: {
      id: tenant.workspaceId,
      organizationId: tenant.organizationId,
      name: `Dataset ${suffix}`,
      slug: `dataset-${suffix}`,
      timezone: "Asia/Jakarta",
      status: "ACTIVE",
    },
  });
}

async function seedMedia(mediaId: string, workspaceId: string, status: string, marker: number) {
  await prisma.mediaAsset.create({
    data: {
      id: mediaId,
      workspaceId,
      source: "MANUAL_UPLOAD",
      originalFilename: `dataset-${marker}.mp4`,
      storageKey: `original/workspace/${workspaceId}/media/${marker}.mp4`,
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
  await seedMedia(mediaReadyA, tenantA.workspaceId, "READY", 31);
  await seedMedia(mediaReadyA2, tenantA.workspaceId, "READY", 32);
  await seedMedia(mediaReadyA3, tenantA.workspaceId, "READY", 33);
  await seedMedia(mediaIngestedA, tenantA.workspaceId, "INGESTED", 34);
  await seedMedia(mediaReadyB, tenantB.workspaceId, "READY", 35);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const createDataset = (name: string) =>
  service.create({ context: context(), requestId, body: { name } });

describe("database-backed dataset foundation", () => {
  it("creates, reads, lists, updates, and hides datasets across workspaces", async () => {
    const created = await createDataset("Integration dataset metadata");
    await expect(
      service.get({ context: context(), datasetId: created.datasetId }),
    ).resolves.toMatchObject({
      datasetId: created.datasetId,
      status: "ACTIVE",
      items: [],
    });
    await expect(
      service.get({ context: context(tenantB), datasetId: created.datasetId }),
    ).rejects.toMatchObject({ code: "DATASET_NOT_FOUND" });
    await expect(service.list({ context: context(), limit: "1" })).resolves.toMatchObject({
      datasets: expect.any(Array),
    });
    await expect(
      service.update({
        context: context(),
        requestId,
        datasetId: created.datasetId,
        body: { expectedVersion: 1, name: "Integration dataset renamed" },
      }),
    ).resolves.toMatchObject({ name: "Integration dataset renamed", version: 2 });
    await expect(
      service.update({
        context: context(),
        requestId,
        datasetId: created.datasetId,
        body: { expectedVersion: 1, name: "Stale update" },
      }),
    ).rejects.toMatchObject({ code: "DATASET_CONFLICT" });

    const current = await prisma.dataset.findUniqueOrThrow({ where: { id: created.datasetId } });
    const concurrent = await Promise.allSettled([
      service.update({
        context: context(),
        requestId,
        datasetId: created.datasetId,
        body: { expectedVersion: current.version, name: "Concurrent metadata A" },
      }),
      service.update({
        context: context(),
        requestId,
        datasetId: created.datasetId,
        body: { expectedVersion: current.version, name: "Concurrent metadata B" },
      }),
    ]);
    expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("paginates datasets with a stable opaque cursor", async () => {
    await createDataset("Integration pagination A");
    await createDataset("Integration pagination B");
    await createDataset("Integration pagination C");
    const first = await service.list({ context: context(), limit: "2" });
    expect(first.datasets).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await service.list({
      context: context(),
      limit: "2",
      cursor: first.nextCursor!,
    });
    expect(second.datasets.length).toBeGreaterThan(0);
    const firstIds = new Set(first.datasets.map(({ datasetId }) => datasetId));
    expect(second.datasets.some(({ datasetId }) => firstIds.has(datasetId))).toBe(false);
  });

  it("enforces READY same-workspace eligibility and duplicate protection", async () => {
    const dataset = await createDataset("Integration eligibility");
    await expect(
      service.addItem({
        context: context(),
        requestId,
        datasetId: dataset.datasetId,
        body: { expectedVersion: 1, mediaAssetId: mediaIngestedA },
      }),
    ).rejects.toMatchObject({ code: "DATASET_MEDIA_NOT_READY" });
    await expect(
      service.addItem({
        context: context(),
        requestId,
        datasetId: dataset.datasetId,
        body: { expectedVersion: 1, mediaAssetId: mediaReadyB },
      }),
    ).rejects.toMatchObject({ code: "DATASET_MEDIA_NOT_READY" });

    const outcomes = await Promise.allSettled([
      service.addItem({
        context: context(),
        requestId,
        datasetId: dataset.datasetId,
        body: { expectedVersion: 1, mediaAssetId: mediaReadyA },
      }),
      service.addItem({
        context: context(),
        requestId,
        datasetId: dataset.datasetId,
        body: { expectedVersion: 1, mediaAssetId: mediaReadyA },
      }),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.datasetItem.count({
        where: { datasetId: dataset.datasetId, mediaAssetId: mediaReadyA },
      }),
    ).toBe(1);
    const persisted = await prisma.dataset.findUniqueOrThrow({ where: { id: dataset.datasetId } });
    await expect(
      service.addItem({
        context: context(),
        requestId,
        datasetId: dataset.datasetId,
        body: { expectedVersion: persisted.version, mediaAssetId: mediaReadyA },
      }),
    ).rejects.toMatchObject({ code: "DATASET_DUPLICATE_MEDIA" });
  });

  it("reorders transactionally and allows only one simultaneous reorder", async () => {
    const dataset = await createDataset("Integration reorder");
    const items = [];
    let version = 1;
    for (const mediaAssetId of [mediaReadyA, mediaReadyA2, mediaReadyA3]) {
      const result = await service.addItem({
        context: context(),
        requestId,
        datasetId: dataset.datasetId,
        body: { expectedVersion: version, mediaAssetId },
      });
      version = result.dataset.version;
      items.push(result.item.datasetItemId);
    }
    const orderA = [items[2]!, items[0]!, items[1]!];
    const orderB = [items[1]!, items[2]!, items[0]!];
    const outcomes = await Promise.allSettled([
      service.reorder({
        context: context(),
        requestId,
        datasetId: dataset.datasetId,
        body: { expectedVersion: version, itemIds: orderA },
      }),
      service.reorder({
        context: context(),
        requestId,
        datasetId: dataset.datasetId,
        body: { expectedVersion: version, itemIds: orderB },
      }),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const stored = await prisma.datasetItem.findMany({
      where: { datasetId: dataset.datasetId },
      orderBy: { position: "asc" },
    });
    expect(stored.map(({ position }) => position)).toEqual([0, 1, 2]);
    expect([orderA, orderB]).toContainEqual(stored.map(({ id: itemId }) => itemId));

    const foreignDataset = await createDataset("Integration foreign reorder item");
    const foreignItem = await service.addItem({
      context: context(),
      requestId,
      datasetId: foreignDataset.datasetId,
      body: { expectedVersion: 1, mediaAssetId: mediaReadyA },
    });
    const current = await prisma.dataset.findUniqueOrThrow({ where: { id: dataset.datasetId } });
    await expect(
      service.reorder({
        context: context(),
        requestId,
        datasetId: dataset.datasetId,
        body: {
          expectedVersion: current.version,
          itemIds: [stored[0]!.id, stored[1]!.id, foreignItem.item.datasetItemId],
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_DATASET_ORDER" });

    await service.removeItem({
      context: context(),
      requestId,
      datasetId: dataset.datasetId,
      itemId: stored[1]!.id,
      body: { expectedVersion: current.version },
    });
    const compacted = await prisma.datasetItem.findMany({
      where: { datasetId: dataset.datasetId },
      orderBy: { position: "asc" },
    });
    expect(compacted.map(({ position }) => position)).toEqual([0, 1]);
    expect(await prisma.mediaAsset.count({ where: { id: stored[1]!.mediaAssetId } })).toBe(1);
  });

  it("serializes archive against item mutation and preserves relations and media", async () => {
    const dataset = await createDataset("Integration archive");
    const outcomes = await Promise.allSettled([
      service.archive({
        context: context(),
        requestId,
        datasetId: dataset.datasetId,
        body: { expectedVersion: 1 },
      }),
      service.addItem({
        context: context(),
        requestId,
        datasetId: dataset.datasetId,
        body: { expectedVersion: 1, mediaAssetId: mediaReadyA2 },
      }),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    let persisted = await prisma.dataset.findUniqueOrThrow({ where: { id: dataset.datasetId } });
    if (persisted.status === "ACTIVE") {
      await service.archive({
        context: context(),
        requestId,
        datasetId: dataset.datasetId,
        body: { expectedVersion: persisted.version },
      });
      persisted = await prisma.dataset.findUniqueOrThrow({ where: { id: dataset.datasetId } });
    }
    expect(persisted.status).toBe("ARCHIVED");
    await expect(
      service.addItem({
        context: context(),
        requestId,
        datasetId: dataset.datasetId,
        body: { expectedVersion: persisted.version, mediaAssetId: mediaReadyA3 },
      }),
    ).rejects.toMatchObject({ code: "DATASET_ARCHIVED" });
    expect(
      await prisma.mediaAsset.count({ where: { id: { in: [mediaReadyA2, mediaReadyA3] } } }),
    ).toBe(2);
  });

  it("enforces lifecycle, duplicate, position, and workspace relations in PostgreSQL", async () => {
    const dataset = await createDataset("Integration database constraints");
    await expect(
      prisma.dataset.update({ where: { id: dataset.datasetId }, data: { status: "UNKNOWN" } }),
    ).rejects.toThrow();
    await expect(
      prisma.datasetItem.create({
        data: {
          id: id(),
          workspaceId: tenantA.workspaceId,
          datasetId: dataset.datasetId,
          mediaAssetId: mediaReadyB,
          position: 0,
        },
      }),
    ).rejects.toThrow();
    const boundaryItem = await prisma.datasetItem.create({
      data: {
        id: id(),
        workspaceId: tenantA.workspaceId,
        datasetId: dataset.datasetId,
        mediaAssetId: mediaReadyA,
        position: 999,
      },
    });
    expect(boundaryItem.position).toBe(999);
    await prisma.datasetItem.delete({ where: { id: boundaryItem.id } });
    await expect(
      prisma.datasetItem.create({
        data: {
          id: id(),
          workspaceId: tenantA.workspaceId,
          datasetId: dataset.datasetId,
          mediaAssetId: mediaReadyA,
          position: 1_000,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.datasetItem.create({
        data: {
          id: id(),
          workspaceId: tenantA.workspaceId,
          datasetId: dataset.datasetId,
          mediaAssetId: mediaReadyA,
          position: -1,
        },
      }),
    ).rejects.toThrow();
  });
});
