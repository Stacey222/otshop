import {
  DatasetRepository,
  MediaAssetRepository,
  MediaImportBatchRepository,
  getDatabaseClient,
} from "@otshop/database";
import { ROLE_PERMISSIONS, createUuidV7, type AuthenticatedContext } from "@otshop/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DatasetService } from "../src/application/datasets/dataset-service";
import { MediaImportBatchService } from "../src/application/media-batches/media-batch-service";
import { MediaIngestService } from "../src/application/media/media-ingest-service";
import { MediaInspectionService } from "../src/application/media/media-inspection-service";
import { mediaChunks, validMp4 } from "../src/application/media/media-test-fixtures";
import {
  PermanentMediaInspectionError,
  type MediaInspector,
} from "../src/application/media/media-inspector";
import type { StorageProvider, StoragePromotion } from "../src/application/media/storage-provider";
import type { ApplicationLogger } from "../src/infrastructure/logging/logger";

const prisma = getDatabaseClient();
const clock = () => new Date("2026-08-25T11:00:00.000Z");
let sequence = 0;
const id = () => createUuidV7(clock().getTime() + sequence++);
const requestId = id();
const tenantA = { userId: id(), organizationId: id(), workspaceId: id(), sessionId: id() };
const tenantB = { userId: id(), organizationId: id(), workspaceId: id(), sessionId: id() };

const logger: ApplicationLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  withContext() {
    return this;
  },
};

class MemoryStorage implements StorageProvider {
  readonly objects = new Map<string, Uint8Array>();
  private temporary = 0;

  async writeTemporary(source: AsyncIterable<Uint8Array>) {
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of source) {
      chunks.push(Uint8Array.from(chunk));
      size += chunk.byteLength;
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const key = `temporary/${this.temporary++}.part`;
    this.objects.set(key, bytes);
    return { key };
  }

  async promoteTemporary(temporaryKey: string, finalKey: string): Promise<StoragePromotion> {
    const bytes = this.objects.get(temporaryKey);
    if (bytes === undefined) throw new Error("missing temporary object");
    const existed = this.objects.has(finalKey);
    if (!existed) this.objects.set(finalKey, bytes);
    this.objects.delete(temporaryKey);
    return existed ? "EXISTS" : "CREATED";
  }

  async openRead(key: string) {
    const bytes = this.objects.get(key);
    if (bytes === undefined) throw new Error("missing object");
    return mediaChunks(bytes, 7);
  }

  async stat(key: string) {
    const bytes = this.objects.get(key);
    return bytes === undefined ? null : { sizeBytes: bytes.byteLength };
  }

  async exists(key: string) {
    return this.objects.has(key);
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

const inspector: MediaInspector = {
  async inspect(source) {
    let last = 0;
    for await (const chunk of source) last = chunk.at(-1) ?? last;
    if (last === 0xee) throw new PermanentMediaInspectionError("UNSUPPORTED_VIDEO_CODEC");
    return {
      durationMs: 10_000n,
      width: 1920,
      height: 1080,
      fps: 25,
      bitrateBps: 1_000_000n,
      codec: "h264",
      audioCodec: "aac",
      orientation: "ROTATION_0",
    };
  },
};

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
      email: `batch-${suffix}@example.test`,
      displayName: `Batch ${suffix}`,
      status: "ACTIVE",
    },
  });
  await prisma.organization.create({
    data: {
      id: tenant.organizationId,
      name: `Batch ${suffix}`,
      slug: `batch-${suffix}`,
      status: "ACTIVE",
    },
  });
  await prisma.workspace.create({
    data: {
      id: tenant.workspaceId,
      organizationId: tenant.organizationId,
      name: `Batch ${suffix}`,
      slug: `batch-${suffix}`,
      timezone: "Asia/Jakarta",
      status: "ACTIVE",
    },
  });
}

beforeAll(async () => {
  await seedTenant(tenantA, `a-${tenantA.workspaceId.slice(-6)}`);
  await seedTenant(tenantB, `b-${tenantB.workspaceId.slice(-6)}`);
});

afterAll(async () => {
  await prisma.$disconnect();
});

function setup() {
  const storage = new MemoryStorage();
  const mediaRepository = new MediaAssetRepository(prisma);
  const ingest = new MediaIngestService(mediaRepository, storage, 1_024, logger, clock);
  const inspection = new MediaInspectionService(
    mediaRepository,
    storage,
    inspector,
    60_000,
    logger,
    clock,
  );
  const datasets = new DatasetService(new DatasetRepository(prisma), logger, clock);
  const service = new MediaImportBatchService(
    new MediaImportBatchRepository(prisma),
    ingest,
    inspection,
    datasets,
    {
      maximumFiles: 25,
      maximumTotalBytes: 10_000,
      maximumConcurrency: 2,
      maximumIndividualBytes: 1_024,
    },
    logger,
    clock,
  );
  return { service, storage };
}

const bytes = (marker: number) => Uint8Array.from([...validMp4, marker]);

async function upload(
  service: MediaImportBatchService,
  batchId: string,
  version: number,
  inputIndex: number,
  filename: string,
  body: Uint8Array,
) {
  return service.uploadItem({
    context: context(),
    requestId,
    batchId,
    expectedVersion: version,
    inputIndex,
    originalFilename: filename,
    declaredMimeType: "video/mp4",
    declaredBytes: body.byteLength,
    source: mediaChunks(body, 5),
  });
}

describe("database-backed media batch foundation", () => {
  it("streams three canonical ingests through inspection into one ordered Dataset", async () => {
    const { service } = setup();
    let batch = await service.create({
      context: context(),
      requestId,
      body: { name: `Batch basic ${id()}` },
    });
    for (const [index, marker] of [1, 2, 3].entries()) {
      batch = await upload(
        service,
        batch.batchId,
        batch.version,
        index,
        `video-${marker}.mp4`,
        bytes(marker),
      );
    }
    const completed = await service.finalize({
      context: context(),
      requestId,
      batchId: batch.batchId,
      body: { expectedVersion: batch.version },
    });
    expect(completed).toMatchObject({
      status: "COMPLETED",
      summary: { total: 3, ready: 3, reused: 0, rejected: 0, failed: 0 },
    });
    const items = await prisma.datasetItem.findMany({
      where: { datasetId: completed.datasetId! },
      orderBy: { position: "asc" },
    });
    expect(items.map(({ position }) => position)).toEqual([0, 1, 2]);
    expect(items.map(({ mediaAssetId }) => mediaAssetId)).toEqual(
      completed.items.map(({ mediaAssetId }) => mediaAssetId),
    );
  });

  it("preserves successful assets across malformed and unsupported partial failures", async () => {
    const { service } = setup();
    let batch = await service.create({
      context: context(),
      requestId,
      body: { name: `Batch partial ${id()}` },
    });
    const inputs = [bytes(11), Uint8Array.from([1, 2, 3]), bytes(12), bytes(0xee), bytes(13)];
    for (const [index, body] of inputs.entries()) {
      batch = await upload(
        service,
        batch.batchId,
        batch.version,
        index,
        `partial-${index}.mp4`,
        body,
      );
    }
    const completed = await service.finalize({
      context: context(),
      requestId,
      batchId: batch.batchId,
      body: { expectedVersion: batch.version },
    });
    expect(completed).toMatchObject({
      status: "COMPLETED_WITH_ERRORS",
      summary: { total: 5, ready: 3, rejected: 2, failed: 0 },
    });
    expect(await prisma.datasetItem.count({ where: { datasetId: completed.datasetId! } })).toBe(3);
    expect(
      await prisma.mediaAsset.count({
        where: {
          workspaceId: tenantA.workspaceId,
          id: { in: completed.items.flatMap((item) => item.mediaAssetId ?? []) },
        },
      }),
    ).toBe(4);
  });

  it("reuses duplicate media, prevents duplicate Dataset membership, and finalizes idempotently", async () => {
    const { service } = setup();
    let batch = await service.create({
      context: context(),
      requestId,
      body: { name: `Batch duplicate ${id()}` },
    });
    const duplicate = bytes(21);
    batch = await upload(service, batch.batchId, batch.version, 0, "original.mp4", duplicate);
    batch = await upload(service, batch.batchId, batch.version, 1, "copy.mp4", duplicate);
    const first = await service.finalize({
      context: context(),
      requestId,
      batchId: batch.batchId,
      body: { expectedVersion: batch.version },
    });
    const repeated = await service.finalize({
      context: context(),
      requestId,
      batchId: batch.batchId,
      body: { expectedVersion: 1 },
    });
    expect(repeated).toEqual(first);
    expect(first.summary).toMatchObject({ ready: 2, reused: 1 });
    expect(await prisma.datasetItem.count({ where: { datasetId: first.datasetId! } })).toBe(1);
    expect(
      await prisma.mediaAsset.count({
        where: {
          workspaceId: tenantA.workspaceId,
          sha256: { equals: Buffer.from(await crypto.subtle.digest("SHA-256", duplicate)) },
        },
      }),
    ).toBe(1);
  });

  it("fails closed for cross-workspace IDs and enforces database constraints", async () => {
    const { service } = setup();
    const batch = await service.create({
      context: context(),
      requestId,
      body: { name: `Batch tenant ${id()}` },
    });
    await expect(
      service.get({ context: context(tenantB), batchId: batch.batchId }),
    ).rejects.toMatchObject({ code: "MEDIA_BATCH_NOT_FOUND" });
    await expect(
      prisma.mediaImportBatch.update({
        where: { id: batch.batchId },
        data: { status: "UNKNOWN" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.mediaImportBatchItem.create({
        data: {
          id: id(),
          workspaceId: tenantB.workspaceId,
          batchId: batch.batchId,
          inputIndex: 0,
          displayFilename: "cross.mp4",
          declaredBytes: 1n,
          outcome: "UPLOADING",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.mediaImportBatchItem.create({
        data: {
          id: id(),
          workspaceId: tenantA.workspaceId,
          batchId: batch.batchId,
          inputIndex: 25,
          displayFilename: "overflow.mp4",
          declaredBytes: 1n,
          outcome: "UPLOADING",
        },
      }),
    ).rejects.toThrow();
  });

  it("allows only one database admission claim for a stale shared version", async () => {
    const { service } = setup();
    const batch = await service.create({
      context: context(),
      requestId,
      body: { name: `Batch admission race ${id()}` },
    });
    const repository = new MediaImportBatchRepository(prisma);
    const attempts = await Promise.all([
      repository.startItem({
        id: id(),
        workspaceId: tenantA.workspaceId,
        batchId: batch.batchId,
        inputIndex: 0,
        displayFilename: "race-a.mp4",
        declaredBytes: 10,
        expectedVersion: batch.version,
        maximumFiles: 25,
        maximumTotalBytes: 10_000,
        maximumConcurrency: 2,
      }),
      repository.startItem({
        id: id(),
        workspaceId: tenantA.workspaceId,
        batchId: batch.batchId,
        inputIndex: 1,
        displayFilename: "race-b.mp4",
        declaredBytes: 10,
        expectedVersion: batch.version,
        maximumFiles: 25,
        maximumTotalBytes: 10_000,
        maximumConcurrency: 2,
      }),
    ]);
    expect(attempts.filter(({ state }) => state === "STARTED")).toHaveLength(1);
    expect(await prisma.mediaImportBatchItem.count({ where: { batchId: batch.batchId } })).toBe(1);
  });
});
