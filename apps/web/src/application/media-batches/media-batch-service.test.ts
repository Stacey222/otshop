import { ROLE_PERMISSIONS, type AuthenticatedContext } from "@otshop/shared";
import { describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import { DatasetConflictError } from "@/application/datasets/dataset-errors";
import type { DatasetService } from "@/application/datasets/dataset-service";
import type { MediaIngestService } from "@/application/media/media-ingest-service";
import type { MediaInspectionService } from "@/application/media/media-inspection-service";
import {
  MediaInspectionFailureError,
  MediaStorageFailureError,
  MediaUnsupportedError,
} from "@/application/media/media-errors";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import {
  InvalidMediaBatchPaginationError,
  MediaBatchConflictError,
  MediaBatchItemConflictError,
  MediaBatchLimitError,
  MediaBatchNotFinalizableError,
  MediaBatchNotFoundError,
} from "./media-batch-errors";
import type {
  MediaImportBatchItemRecord,
  MediaImportBatchRecord,
  MediaImportBatchRepositoryPort,
} from "./media-batch-repository";
import { MediaImportBatchService } from "./media-batch-service";

const workspaceA = "01941f29-7c00-7000-8000-000000000001";
const workspaceB = "01941f29-7c00-7000-8000-000000000002";
const userId = "01941f29-7c00-7000-8000-000000000003";
const sessionId = "01941f29-7c00-7000-8000-000000000004";
const requestId = "01941f29-7c00-7000-8000-000000000005";
const datasetId = "01941f29-7c00-7000-8000-000000000006";
const now = new Date("2026-08-25T10:00:00.000Z");

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

class MemoryBatchRepository implements MediaImportBatchRepositoryPort {
  batch: MediaImportBatchRecord | null = null;
  readonly items = new Map<number, MediaImportBatchItemRecord>();
  fail = false;
  failFinish = false;

  private update(changes: Partial<MediaImportBatchRecord>): MediaImportBatchRecord {
    this.batch = { ...this.batch!, ...changes, updatedAt: now };
    return this.batch;
  }

  async create(input: Parameters<MediaImportBatchRepositoryPort["create"]>[0]) {
    if (this.fail) throw new Error("database");
    this.batch = {
      ...input,
      status: "CREATED",
      totalBytes: 0n,
      reservedBytes: 0n,
      activeUploads: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    return this.batch;
  }

  async findByWorkspaceAndId(workspaceId: string, batchId: string) {
    if (this.fail) throw new Error("database");
    return this.batch?.workspaceId === workspaceId && this.batch.id === batchId ? this.batch : null;
  }

  async listItems(input: Parameters<MediaImportBatchRepositoryPort["listItems"]>[0]) {
    const values = [...this.items.values()]
      .filter((item) => item.workspaceId === input.workspaceId && item.batchId === input.batchId)
      .filter(
        (item) => input.afterInputIndex === undefined || item.inputIndex > input.afterInputIndex,
      )
      .sort((left, right) => left.inputIndex - right.inputIndex);
    return { items: values.slice(0, input.limit), hasMore: values.length > input.limit };
  }

  async startItem(input: Parameters<MediaImportBatchRepositoryPort["startItem"]>[0]) {
    const batch = await this.findByWorkspaceAndId(input.workspaceId, input.batchId);
    if (batch === null) return { state: "NOT_FOUND" } as const;
    if (["COMPLETED", "COMPLETED_WITH_ERRORS", "FINALIZING", "FAILED"].includes(batch.status)) {
      return { state: "FINAL" } as const;
    }
    if (batch.version !== input.expectedVersion) return { state: "CONFLICT" } as const;
    if (this.items.has(input.inputIndex)) return { state: "ITEM_CONFLICT" } as const;
    if (this.items.size >= input.maximumFiles) return { state: "FILE_LIMIT" } as const;
    if (batch.activeUploads >= input.maximumConcurrency) {
      return { state: "ACTIVE_UPLOADS" } as const;
    }
    if (
      batch.totalBytes + batch.reservedBytes + BigInt(input.declaredBytes) >
      BigInt(input.maximumTotalBytes)
    ) {
      return { state: "TOTAL_LIMIT" } as const;
    }
    const item: MediaImportBatchItemRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      batchId: input.batchId,
      mediaAssetId: null,
      inputIndex: input.inputIndex,
      displayFilename: input.displayFilename,
      outcome: "UPLOADING",
      declaredBytes: BigInt(input.declaredBytes),
      sizeBytes: null,
      errorCode: null,
      datasetPosition: null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(input.inputIndex, item);
    const updated = this.update({
      status: "PROCESSING",
      activeUploads: batch.activeUploads + 1,
      reservedBytes: batch.reservedBytes + BigInt(input.declaredBytes),
      version: batch.version + 1,
    });
    return { state: "STARTED", batch: updated, item } as const;
  }

  async finishItem(input: Parameters<MediaImportBatchRepositoryPort["finishItem"]>[0]) {
    if (this.failFinish) throw new Error("database");
    const item = [...this.items.values()].find(({ id }) => id === input.itemId);
    if (item === undefined || item.outcome !== "UPLOADING") return false;
    this.items.set(item.inputIndex, {
      ...item,
      outcome: input.outcome,
      mediaAssetId: input.mediaAssetId,
      sizeBytes: BigInt(input.actualBytes),
      errorCode: input.errorCode,
    });
    this.update({
      activeUploads: this.batch!.activeUploads - 1,
      reservedBytes: this.batch!.reservedBytes - item.declaredBytes,
      totalBytes: this.batch!.totalBytes + BigInt(input.actualBytes),
      version: this.batch!.version + 1,
    });
    return true;
  }

  async claimFinalization(
    input: Parameters<MediaImportBatchRepositoryPort["claimFinalization"]>[0],
  ) {
    const batch = await this.findByWorkspaceAndId(input.workspaceId, input.batchId);
    if (batch === null) return { state: "NOT_FOUND" } as const;
    if (batch.status === "COMPLETED" || batch.status === "COMPLETED_WITH_ERRORS") {
      return { state: "FINAL", batch } as const;
    }
    if (batch.version !== input.expectedVersion) return { state: "CONFLICT" } as const;
    if (batch.activeUploads !== 0) return { state: "ACTIVE_UPLOADS" } as const;
    if (
      this.items.size === 0 ||
      [...this.items.values()].some(({ outcome }) => outcome === "UPLOADING")
    ) {
      return { state: "NOT_FINALIZABLE" } as const;
    }
    return {
      state: "CLAIMED",
      batch: this.update({ status: "FINALIZING", version: batch.version + 1 }),
    } as const;
  }

  async markDatasetPosition(
    input: Parameters<MediaImportBatchRepositoryPort["markDatasetPosition"]>[0],
  ) {
    const item = [...this.items.values()].find(({ id }) => id === input.itemId);
    if (item === undefined || item.datasetPosition !== null) return false;
    this.items.set(item.inputIndex, { ...item, datasetPosition: input.datasetPosition });
    return true;
  }

  async completeFinalization(
    input: Parameters<MediaImportBatchRepositoryPort["completeFinalization"]>[0],
  ) {
    if (this.batch?.status !== "FINALIZING") return null;
    return this.update({ status: input.status, version: this.batch.version + 1 });
  }

  async failFinalization() {
    if (this.batch?.status === "FINALIZING") {
      this.update({ status: "FAILED", version: this.batch.version + 1 });
    }
  }
}

const stream = (value: string): AsyncIterable<Uint8Array> => ({
  async *[Symbol.asyncIterator]() {
    yield new TextEncoder().encode(value);
  },
});

function setup(
  options: {
    maximumFiles?: number;
    maximumTotalBytes?: number;
    maximumConcurrency?: number;
    ingestDelay?: (filename: string) => Promise<void>;
    datasetAddFailure?: boolean;
    ingestFailureFilename?: string;
    maximumIndividualBytes?: number;
  } = {},
) {
  const repository = new MemoryBatchRepository();
  const media = new Map<string, string>();
  let sequence = 0;
  const ingestService = {
    async ingest(input: { originalFilename: string; source: AsyncIterable<Uint8Array> }) {
      for await (const _chunk of input.source) void _chunk;
      await options.ingestDelay?.(input.originalFilename);
      if (input.originalFilename === options.ingestFailureFilename) {
        throw new MediaStorageFailureError();
      }
      const canonical = input.originalFilename.startsWith("copy-")
        ? input.originalFilename.slice(5)
        : input.originalFilename;
      const existing = media.get(canonical);
      if (existing !== undefined) {
        return { mediaAssetId: existing, duplicate: true };
      }
      const mediaAssetId = `01941f29-7c00-7000-8000-${String(100 + sequence++).padStart(12, "0")}`;
      media.set(canonical, mediaAssetId);
      return { mediaAssetId, duplicate: false };
    },
  } as unknown as MediaIngestService;
  const inspectionService = {
    async inspect({ mediaAssetId }: { mediaAssetId: string }) {
      const filename = [...media].find(([, id]) => id === mediaAssetId)?.[0] ?? "";
      if (filename.startsWith("bad")) throw new MediaUnsupportedError();
      if (filename.startsWith("fail")) throw new MediaInspectionFailureError();
      return { mediaAssetId, status: "READY" };
    },
  } as unknown as MediaInspectionService;
  const datasetMedia: string[] = [];
  let datasetVersion = 1;
  const datasetService = {
    async create() {
      return { datasetId, version: 1, itemCount: 0 };
    },
    async get() {
      return {
        datasetId,
        version: datasetVersion,
        itemCount: datasetMedia.length,
        items: datasetMedia.map((mediaAssetId, position) => ({ mediaAssetId, position })),
      };
    },
    async addItem(input: { body: { expectedVersion: number; mediaAssetId: string } }) {
      if (options.datasetAddFailure) throw new Error("dataset database");
      if (input.body.expectedVersion !== datasetVersion) throw new DatasetConflictError();
      if (datasetMedia.includes(input.body.mediaAssetId)) throw new DatasetConflictError();
      const position = datasetMedia.length;
      datasetMedia.push(input.body.mediaAssetId);
      datasetVersion += 1;
      return {
        dataset: { version: datasetVersion, itemCount: datasetMedia.length },
        item: { position },
      };
    },
  } as unknown as DatasetService;
  const service = new MediaImportBatchService(
    repository,
    ingestService,
    inspectionService,
    datasetService,
    {
      maximumFiles: options.maximumFiles ?? 25,
      maximumTotalBytes: options.maximumTotalBytes ?? 1_000,
      maximumConcurrency: options.maximumConcurrency ?? 2,
      maximumIndividualBytes: options.maximumIndividualBytes ?? 500,
    },
    logger,
    () => now,
  );
  return { datasetMedia, media, repository, service };
}

async function create(service: MediaImportBatchService) {
  return service.create({ context: context(), requestId, body: { name: "Folder batch" } });
}

async function upload(
  service: MediaImportBatchService,
  batchId: string,
  version: number,
  inputIndex: number,
  filename: string,
  value = "video",
) {
  return service.uploadItem({
    context: context(),
    requestId,
    batchId,
    expectedVersion: version,
    inputIndex,
    originalFilename: filename,
    declaredMimeType: "video/mp4",
    declaredBytes: new TextEncoder().encode(value).byteLength,
    source: stream(value),
  });
}

describe("MediaImportBatchService", () => {
  it("creates a dedicated Dataset and fails closed for permissions and tenants", async () => {
    const { service } = setup();
    const batch = await create(service);
    expect(batch).toMatchObject({ datasetId, status: "CREATED", version: 1 });
    await expect(
      service.get({ context: context(workspaceB), batchId: batch.batchId }),
    ).rejects.toBeInstanceOf(MediaBatchNotFoundError);
    await expect(
      service.get({
        context: {
          ...context(),
          permissions: ROLE_PERMISSIONS.ADMIN.filter((value) => value !== "datasets.write"),
        },
        batchId: batch.batchId,
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    for (const permission of ["media.upload", "datasets.read"] as const) {
      await expect(
        service.get({
          context: {
            ...context(),
            permissions: ROLE_PERMISSIONS.ADMIN.filter((value) => value !== permission),
          },
          batchId: batch.batchId,
        }),
      ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    }
  });

  it("imports, inspects, and assembles READY media in explicit input order", async () => {
    const { datasetMedia, service } = setup();
    let batch = await create(service);
    for (const [index, filename] of ["a.mp4", "b.mp4", "c.mp4"].entries()) {
      batch = await upload(service, batch.batchId, batch.version, index, filename);
    }
    const completed = await service.finalize({
      context: context(),
      requestId,
      batchId: batch.batchId,
      body: { expectedVersion: batch.version },
    });
    expect(completed).toMatchObject({
      status: "COMPLETED",
      summary: { total: 3, ready: 3, rejected: 0, failed: 0 },
      items: [{ datasetPosition: 0 }, { datasetPosition: 1 }, { datasetPosition: 2 }],
    });
    expect(datasetMedia).toEqual(completed.items.map(({ mediaAssetId }) => mediaAssetId));
  });

  it("preserves partial successes and classifies rejection versus system failure", async () => {
    const { datasetMedia, media, service } = setup();
    let batch = await create(service);
    for (const [index, filename] of ["a.mp4", "bad.mp4", "c.mp4", "fail.mp4", "e.mp4"].entries()) {
      batch = await upload(service, batch.batchId, batch.version, index, filename);
    }
    const completed = await service.finalize({
      context: context(),
      requestId,
      batchId: batch.batchId,
      body: { expectedVersion: batch.version },
    });
    expect(completed).toMatchObject({
      status: "COMPLETED_WITH_ERRORS",
      summary: { total: 5, ready: 3, rejected: 1, failed: 1 },
    });
    expect(datasetMedia).toEqual([media.get("a.mp4"), media.get("c.mp4"), media.get("e.mp4")]);
    expect(media.size).toBe(5);
  });

  it("reports duplicates deterministically and inserts one Dataset item", async () => {
    const { datasetMedia, media, service } = setup();
    let batch = await create(service);
    batch = await upload(service, batch.batchId, batch.version, 0, "a.mp4");
    batch = await upload(service, batch.batchId, batch.version, 1, "copy-a.mp4");
    batch = await upload(service, batch.batchId, batch.version, 2, "copy-a.mp4");
    const completed = await service.finalize({
      context: context(),
      requestId,
      batchId: batch.batchId,
      body: { expectedVersion: batch.version },
    });
    expect(completed.summary).toMatchObject({ ready: 3, reused: 2 });
    expect(completed.items.map(({ outcome }) => outcome)).toEqual(["SUCCESS", "REUSED", "REUSED"]);
    expect(completed.items.map(({ datasetPosition }) => datasetPosition)).toEqual([0, 0, 0]);
    expect(datasetMedia).toHaveLength(1);
    expect(media).toHaveLength(1);
  });

  it("is idempotent when finalization is repeated", async () => {
    const { datasetMedia, service } = setup();
    let batch = await create(service);
    batch = await upload(service, batch.batchId, batch.version, 0, "a.mp4");
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
    expect(datasetMedia).toHaveLength(1);
  });

  it("enforces file, byte, stale-version, input-index, and pagination boundaries", async () => {
    const { repository, service } = setup({ maximumFiles: 1, maximumTotalBytes: 5 });
    let batch = await create(service);
    await expect(
      upload(service, batch.batchId, batch.version, 0, "a.mp4", "123456"),
    ).rejects.toBeInstanceOf(MediaBatchLimitError);
    batch = await upload(service, batch.batchId, batch.version, 0, "a.mp4", "12345");
    await expect(
      upload(service, batch.batchId, batch.version, 1, "b.mp4", "1"),
    ).rejects.toBeInstanceOf(MediaBatchLimitError);
    await expect(upload(service, batch.batchId, 1, 0, "a.mp4", "1")).rejects.toBeInstanceOf(
      MediaBatchConflictError,
    );
    repository.fail = true;
    await expect(
      service.get({ context: context(), batchId: batch.batchId, limit: "101" }),
    ).rejects.toBeInstanceOf(InvalidMediaBatchPaginationError);
  });

  it("enforces the exact individual-media byte boundary", async () => {
    const { service } = setup({ maximumIndividualBytes: 5 });
    let batch = await create(service);
    batch = await upload(service, batch.batchId, batch.version, 0, "exact.mp4", "12345");
    expect(batch.items[0]?.outcome).toBe("SUCCESS");
    await expect(
      upload(service, batch.batchId, batch.version, 1, "overflow.mp4", "123456"),
    ).rejects.toBeInstanceOf(MediaBatchLimitError);
  });

  it("rejects the same input index and empty finalization", async () => {
    const { service } = setup();
    let batch = await create(service);
    await expect(
      service.finalize({
        context: context(),
        requestId,
        batchId: batch.batchId,
        body: { expectedVersion: batch.version },
      }),
    ).rejects.toBeInstanceOf(MediaBatchNotFinalizableError);
    batch = await upload(service, batch.batchId, batch.version, 0, "a.mp4");
    await expect(upload(service, batch.batchId, batch.version, 0, "b.mp4")).rejects.toBeInstanceOf(
      MediaBatchItemConflictError,
    );
  });

  it("counts the stream independently of Content-Length and paginates results", async () => {
    const { service } = setup();
    let batch = await create(service);
    batch = await service.uploadItem({
      context: context(),
      requestId,
      batchId: batch.batchId,
      expectedVersion: batch.version,
      inputIndex: 0,
      originalFilename: "overflow.mp4",
      declaredMimeType: "video/mp4",
      declaredBytes: 5,
      source: stream("123456"),
    });
    expect(batch.items[0]).toMatchObject({
      outcome: "REJECTED",
      errorCode: "MEDIA_BATCH_LIMIT",
      sizeBytes: "6",
    });
    batch = await upload(service, batch.batchId, batch.version, 1, "valid.mp4");
    const first = await service.get({
      context: context(),
      batchId: batch.batchId,
      limit: "1",
    });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBe("0");
    const second = await service.get({
      context: context(),
      batchId: batch.batchId,
      limit: "1",
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.inputIndex).toBe(1);
  });

  it("bounds active uploads and finalization during an upload", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service } = setup({
      maximumConcurrency: 1,
      ingestDelay: async () => waiting,
    });
    const created = await create(service);
    const active = upload(service, created.batchId, created.version, 0, "a.mp4");
    await Promise.resolve();
    await Promise.resolve();
    const observed = await service.get({ context: context(), batchId: created.batchId });
    expect(observed.summary.uploading).toBe(1);
    await expect(
      upload(service, created.batchId, observed.version, 1, "b.mp4"),
    ).rejects.toBeInstanceOf(MediaBatchLimitError);
    await expect(
      service.finalize({
        context: context(),
        requestId,
        batchId: created.batchId,
        body: { expectedVersion: observed.version },
      }),
    ).rejects.toBeInstanceOf(MediaBatchLimitError);
    release();
    await active;
  });

  it("keeps input order when uploads complete out of order", async () => {
    let releaseA!: () => void;
    const waitingA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const { datasetMedia, media, service } = setup({
      maximumConcurrency: 2,
      ingestDelay: async (filename) => {
        if (filename === "a.mp4") await waitingA;
      },
    });
    const created = await create(service);
    const uploadA = upload(service, created.batchId, created.version, 0, "a.mp4");
    await Promise.resolve();
    await Promise.resolve();
    const active = await service.get({ context: context(), batchId: created.batchId });
    const completedB = await upload(service, created.batchId, active.version, 1, "b.mp4");
    expect(completedB.items.find(({ inputIndex }) => inputIndex === 0)?.outcome).toBe("UPLOADING");
    releaseA();
    const completedA = await uploadA;
    const finalized = await service.finalize({
      context: context(),
      requestId,
      batchId: created.batchId,
      body: { expectedVersion: completedA.version },
    });
    expect(datasetMedia).toEqual([media.get("a.mp4"), media.get("b.mp4")]);
    expect(finalized.items.map(({ datasetPosition }) => datasetPosition)).toEqual([0, 1]);
  });

  it("preserves canonical media when Dataset assembly or item persistence fails", async () => {
    const assembly = setup({ datasetAddFailure: true });
    let batch = await create(assembly.service);
    batch = await upload(assembly.service, batch.batchId, batch.version, 0, "a.mp4");
    await expect(
      assembly.service.finalize({
        context: context(),
        requestId,
        batchId: batch.batchId,
        body: { expectedVersion: batch.version },
      }),
    ).rejects.toMatchObject({ code: "MEDIA_BATCH_PERSISTENCE_FAILURE" });
    expect(assembly.media).toHaveLength(1);
    expect(assembly.repository.batch?.status).toBe("FAILED");

    const itemPersistence = setup();
    const created = await create(itemPersistence.service);
    itemPersistence.repository.failFinish = true;
    await expect(
      upload(itemPersistence.service, created.batchId, created.version, 0, "kept.mp4"),
    ).rejects.toMatchObject({ code: "MEDIA_BATCH_PERSISTENCE_FAILURE" });
    expect(itemPersistence.media).toHaveLength(1);
    expect(itemPersistence.repository.items.get(0)?.outcome).toBe("UPLOADING");
  });

  it("reports storage failure per item and fails closed on Dataset collision", async () => {
    const storage = setup({ ingestFailureFilename: "storage-fail.mp4" });
    let failed = await create(storage.service);
    failed = await upload(storage.service, failed.batchId, failed.version, 0, "storage-fail.mp4");
    expect(failed.items[0]).toMatchObject({
      outcome: "FAILED",
      errorCode: "MEDIA_STORAGE_FAILURE",
    });

    const collision = setup();
    let batch = await create(collision.service);
    batch = await upload(collision.service, batch.batchId, batch.version, 0, "a.mp4");
    collision.datasetMedia.push("01941f29-7c00-7000-8000-000000000099");
    await expect(
      collision.service.finalize({
        context: context(),
        requestId,
        batchId: batch.batchId,
        body: { expectedVersion: batch.version },
      }),
    ).rejects.toBeInstanceOf(MediaBatchConflictError);
    expect(collision.media).toHaveLength(1);
  });

  it("maps initial batch persistence failure without exposing database details", async () => {
    const failing = setup();
    failing.repository.fail = true;
    await expect(create(failing.service)).rejects.toMatchObject({
      code: "MEDIA_BATCH_PERSISTENCE_FAILURE",
      message: "The media batch could not be saved safely",
    });
  });

  it("rejects path-like filenames and invalid batch identifiers", async () => {
    const { service } = setup();
    const batch = await create(service);
    await expect(
      upload(service, batch.batchId, batch.version, 0, "../private.mp4"),
    ).rejects.toMatchObject({ code: "INVALID_MEDIA_FILENAME" });
    await expect(
      service.get({ context: context(), batchId: "not-a-batch-id" }),
    ).rejects.toBeInstanceOf(MediaBatchNotFoundError);
  });
});
