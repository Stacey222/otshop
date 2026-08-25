import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { MediaAssetRepository, getDatabaseClient } from "@otshop/database";
import { WorkspaceIdSchema, createUuidV7 } from "@otshop/shared";
import { afterAll, describe, expect, it } from "vitest";

import { MediaPersistenceFailureError } from "../src/application/media/media-errors";
import { MediaIngestService } from "../src/application/media/media-ingest-service";
import { MediaInspectionService } from "../src/application/media/media-inspection-service";
import type { MediaAssetRepositoryPort } from "../src/application/media/media-asset-repository";
import type {
  MediaInspector,
  NormalizedMediaMetadata,
} from "../src/application/media/media-inspector";
import {
  MediaInspectionInProgressError,
  MediaNotFoundError,
} from "../src/application/media/media-errors";
import {
  mediaChunks,
  mediaContext,
  mediaRequestId,
  silentMediaLogger,
  validMp4,
  validMp4Sha256,
} from "../src/application/media/media-test-fixtures";
import { LocalStorageProvider } from "../src/infrastructure/storage/local-storage-provider";

const prisma = getDatabaseClient();
const storageParent = resolve("storage", "integration-runs");
const storageRoot = join(storageParent, randomUUID());
const organizationId = createUuidV7();
const workspaceA = WorkspaceIdSchema.parse(createUuidV7());
const workspaceB = WorkspaceIdSchema.parse(createUuidV7());

const cleanStorage = async (): Promise<void> => {
  const relation = relative(storageParent, storageRoot);
  if (relation.length === 0 || relation.startsWith("..")) {
    throw new Error("Unsafe integration storage cleanup target");
  }
  await rm(storageRoot, { recursive: true, force: true });
};

afterAll(async () => {
  await prisma.mediaAsset.deleteMany({ where: { workspaceId: { in: [workspaceA, workspaceB] } } });
  await prisma.workspace.deleteMany({ where: { id: { in: [workspaceA, workspaceB] } } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await cleanStorage();
});

describe("database-backed immutable media ingestion", () => {
  it("deduplicates concurrent content per workspace while preserving tenant isolation", async () => {
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Media integration organization",
        slug: `media-integration-${organizationId}`,
        status: "ACTIVE",
        workspaces: {
          createMany: {
            data: [
              {
                id: workspaceA,
                name: "Media workspace A",
                slug: `media-a-${workspaceA}`,
                timezone: "Asia/Jakarta",
                status: "ACTIVE",
              },
              {
                id: workspaceB,
                name: "Media workspace B",
                slug: `media-b-${workspaceB}`,
                timezone: "Asia/Jakarta",
                status: "ACTIVE",
              },
            ],
          },
        },
      },
    });

    const repository = new MediaAssetRepository(prisma);
    const storage = new LocalStorageProvider(storageRoot);
    const service = new MediaIngestService(
      repository,
      storage,
      1_024,
      silentMediaLogger,
      () => new Date(),
    );
    const upload = (workspaceId: typeof workspaceA) =>
      service.ingest({
        context: mediaContext("ADMIN", workspaceId),
        requestId: mediaRequestId,
        originalFilename: "integration.mp4",
        declaredMimeType: "video/mp4",
        source: mediaChunks(validMp4, 3),
      });

    const sameWorkspace = await Promise.all([
      upload(workspaceA),
      upload(workspaceA),
      upload(workspaceA),
    ]);
    const otherWorkspace = await upload(workspaceB);
    expect(new Set(sameWorkspace.map(({ mediaAssetId }) => mediaAssetId)).size).toBe(1);
    expect(sameWorkspace.filter(({ duplicate }) => !duplicate)).toHaveLength(1);
    expect(otherWorkspace.mediaAssetId).not.toBe(sameWorkspace[0]?.mediaAssetId);

    const records = await prisma.mediaAsset.findMany({
      where: { workspaceId: { in: [workspaceA, workspaceB] } },
      orderBy: { workspaceId: "asc" },
    });
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(Buffer.from(record.sha256).toString("hex")).toBe(validMp4Sha256);
      expect(record.status).toBe("INGESTED");
      expect(record.durationMs).toBeNull();
      expect(record.codec).toBeNull();
      expect(record.storageKey).toContain(`/workspace/${record.workspaceId}/`);
      await expect(storage.exists(record.storageKey)).resolves.toBe(true);
    }
    expect(records[0]?.storageKey).not.toBe(records[1]?.storageKey);

    const normalized: NormalizedMediaMetadata = {
      durationMs: 2_000n,
      width: 1080,
      height: 1920,
      fps: 29.97,
      bitrateBps: 4_000_000n,
      codec: "h264",
      audioCodec: "aac",
      orientation: "ROTATION_90",
    };
    let inspectionCalls = 0;
    const inspector: MediaInspector = {
      async inspect(source) {
        for await (const _chunk of source) void _chunk;
        inspectionCalls += 1;
        return normalized;
      },
    };
    const inspectionService = new MediaInspectionService(
      repository,
      storage,
      inspector,
      60_000,
      silentMediaLogger,
    );
    const workspaceARecord = records.find(({ workspaceId }) => workspaceId === workspaceA);
    const workspaceBRecord = records.find(({ workspaceId }) => workspaceId === workspaceB);
    if (workspaceARecord === undefined || workspaceBRecord === undefined) {
      throw new Error("Expected both workspace media fixtures");
    }
    const inspectA = () =>
      inspectionService.inspect({
        context: mediaContext("ADMIN", workspaceA),
        requestId: mediaRequestId,
        mediaAssetId: workspaceARecord.id,
      });
    await expect(inspectA()).resolves.toMatchObject({
      status: "READY",
      durationMs: 2_000,
      width: 1080,
      height: 1920,
      fps: 29.97,
      bitrateBps: 4_000_000,
      codec: "h264",
      audioCodec: "aac",
      orientation: "ROTATION_90",
    });
    await expect(inspectA()).resolves.toMatchObject({ status: "READY" });
    expect(inspectionCalls).toBe(1);
    await expect(
      inspectionService.inspect({
        context: mediaContext("ADMIN", workspaceB),
        requestId: mediaRequestId,
        mediaAssetId: workspaceARecord.id,
      }),
    ).rejects.toBeInstanceOf(MediaNotFoundError);
    const persistedMetadata = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: workspaceARecord.id },
    });
    expect(persistedMetadata).toMatchObject({
      status: "READY",
      durationMs: 2_000n,
      width: 1080,
      height: 1920,
      codec: "h264",
      audioCodec: "aac",
      orientation: "ROTATION_90",
      validationErrorCode: null,
      version: 3,
    });
    expect(persistedMetadata.fps?.toString()).toBe("29.97");

    let releaseInspection: ((value: NormalizedMediaMetadata) => void) | undefined;
    const blockingInspector: MediaInspector = {
      async inspect(source) {
        for await (const _chunk of source) void _chunk;
        return new Promise((resolve) => {
          releaseInspection = resolve;
        });
      },
    };
    const concurrentService = new MediaInspectionService(
      repository,
      storage,
      blockingInspector,
      60_000,
      silentMediaLogger,
    );
    const inspectB = () =>
      concurrentService.inspect({
        context: mediaContext("ADMIN", workspaceB),
        requestId: mediaRequestId,
        mediaAssetId: workspaceBRecord.id,
      });
    const firstInspection = inspectB();
    while (releaseInspection === undefined) {
      await new Promise<void>((resolveWait) => setImmediate(resolveWait));
    }
    await expect(inspectB()).rejects.toBeInstanceOf(MediaInspectionInProgressError);
    releaseInspection(normalized);
    await expect(firstInspection).resolves.toMatchObject({ status: "READY" });

    const failingRepository: MediaAssetRepositoryPort = {
      findByWorkspaceAndSha256: async () => {
        throw new Error("synthetic database outage");
      },
      createOrFind: async () => {
        throw new Error("not reached");
      },
    };
    const failingService = new MediaIngestService(
      failingRepository,
      storage,
      1_024,
      silentMediaLogger,
    );
    await expect(
      failingService.ingest({
        context: mediaContext("ADMIN", workspaceA),
        requestId: mediaRequestId,
        originalFilename: "failure.mp4",
        declaredMimeType: "video/mp4",
        source: mediaChunks(Uint8Array.from([...validMp4, 1]), 4),
      }),
    ).rejects.toBeInstanceOf(MediaPersistenceFailureError);
    await expect(readdir(join(storageRoot, "temporary"))).resolves.toEqual([]);
  });
});
