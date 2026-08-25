import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";

import {
  InvalidMediaError,
  InvalidMediaFilenameError,
  MediaPersistenceFailureError,
  MediaStorageFailureError,
  MediaTooLargeError,
  UnsupportedMediaTypeError,
} from "./media-errors";
import { MediaIngestService } from "./media-ingest-service";
import type {
  CreateMediaAssetInput,
  CreateMediaAssetResult,
  MediaAssetRecord,
  MediaAssetRepositoryPort,
} from "./media-asset-repository";
import {
  mediaChunks,
  mediaContext,
  mediaRequestId,
  mediaWorkspaceA,
  mediaWorkspaceB,
  silentMediaLogger,
  validMp4,
  validMp4Sha256,
} from "./media-test-fixtures";
import type {
  StoragePromotion,
  StorageProvider,
  StoredObjectStat,
  TemporaryStorageObject,
} from "./storage-provider";

class MemoryStorage implements StorageProvider {
  readonly objects = new Map<string, Uint8Array>();
  chunkCount = 0;
  maximumObservedChunk = 0;
  failPromotion = false;
  failWrite = false;
  private temporarySequence = 0;

  async writeTemporary(source: AsyncIterable<Uint8Array>): Promise<TemporaryStorageObject> {
    const key = `temporary/test-${this.temporarySequence++}.part`;
    const chunks: Uint8Array[] = [];
    try {
      for await (const chunk of source) {
        this.chunkCount += 1;
        this.maximumObservedChunk = Math.max(this.maximumObservedChunk, chunk.byteLength);
        chunks.push(Uint8Array.from(chunk));
        if (this.failWrite) throw new Error("synthetic write failure");
      }
      const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      this.objects.set(key, bytes);
      return { key };
    } catch (error) {
      this.objects.delete(key);
      throw error;
    }
  }

  async promoteTemporary(temporaryKey: string, finalKey: string): Promise<StoragePromotion> {
    if (this.failPromotion) throw new Error("synthetic promotion failure");
    const temporary = this.objects.get(temporaryKey);
    if (temporary === undefined) throw new Error("temporary object missing");
    const result = this.objects.has(finalKey) ? "EXISTS" : "CREATED";
    if (result === "CREATED") this.objects.set(finalKey, Uint8Array.from(temporary));
    this.objects.delete(temporaryKey);
    return result;
  }

  async openRead(key: string): Promise<AsyncIterable<Uint8Array>> {
    const value = this.objects.get(key);
    if (value === undefined) throw new Error("object missing");
    return mediaChunks(value, 7);
  }

  async stat(key: string): Promise<StoredObjectStat | null> {
    const value = this.objects.get(key);
    return value === undefined ? null : { sizeBytes: value.byteLength };
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

class MemoryRepository implements MediaAssetRepositoryPort {
  readonly assets = new Map<string, MediaAssetRecord>();
  failFind = false;
  failCreate = false;

  private key(workspaceId: string, sha256: Uint8Array): string {
    return `${workspaceId}:${Buffer.from(sha256).toString("hex")}`;
  }

  async findByWorkspaceAndSha256(
    workspaceId: string,
    sha256: Uint8Array,
  ): Promise<MediaAssetRecord | null> {
    if (this.failFind) throw new Error("synthetic database failure");
    return this.assets.get(this.key(workspaceId, sha256)) ?? null;
  }

  async createOrFind(input: CreateMediaAssetInput): Promise<CreateMediaAssetResult> {
    if (this.failCreate) throw new Error("synthetic database failure");
    await Promise.resolve();
    const key = this.key(input.workspaceId, input.sha256);
    const existing = this.assets.get(key);
    if (existing !== undefined) return { asset: existing, created: false };
    const asset: MediaAssetRecord = {
      ...input,
      sha256: Uint8Array.from(input.sha256),
      durationMs: null,
      width: null,
      height: null,
      fps: null,
      bitrateBps: null,
      codec: null,
      audioCodec: null,
      orientation: null,
      validationErrorCode: null,
      createdAt: new Date("2026-08-24T00:00:00.000Z"),
      updatedAt: new Date("2026-08-24T00:00:00.000Z"),
      version: 1,
    };
    this.assets.set(key, asset);
    return { asset, created: true };
  }
}

const service = (
  repository = new MemoryRepository(),
  storage = new MemoryStorage(),
  maximum = 1_024,
) =>
  new MediaIngestService(
    repository,
    storage,
    maximum,
    silentMediaLogger,
    () => new Date("2026-08-24T00:00:00.000Z"),
  );

const ingest = (
  instance: MediaIngestService,
  overrides: Partial<Parameters<MediaIngestService["ingest"]>[0]> = {},
) =>
  instance.ingest({
    context: mediaContext(),
    requestId: mediaRequestId,
    originalFilename: "sample.mp4",
    declaredMimeType: "video/mp4",
    source: mediaChunks(validMp4, 5),
    ...overrides,
  });

describe("MediaIngestService", () => {
  it("streams, validates, hashes, stores, and persists safe immutable media metadata", async () => {
    const repository = new MemoryRepository();
    const storage = new MemoryStorage();
    const result = await ingest(service(repository, storage), {
      originalFilename: "  video-😀.MP4  ",
    });

    expect(result).toMatchObject({
      originalFilename: "video-😀.MP4",
      mimeType: "video/mp4",
      sizeBytes: validMp4.byteLength,
      sha256: validMp4Sha256,
      duplicate: false,
    });
    expect(result).not.toHaveProperty("storageKey");
    const asset = [...repository.assets.values()][0];
    expect(asset).toMatchObject({ workspaceId: mediaWorkspaceA, status: "INGESTED" });
    expect(asset?.storageKey).toMatch(
      new RegExp(`^original/workspace/${mediaWorkspaceA}/media/[a-f0-9]{64}\\.mp4$`, "u"),
    );
    expect(asset?.storageKey).not.toContain("video-😀");
    expect(storage.chunkCount).toBeGreaterThan(1);
    expect(storage.maximumObservedChunk).toBe(5);
  });

  it.each([
    ["", InvalidMediaFilenameError],
    ["   ", InvalidMediaFilenameError],
    ["../evil.mp4", InvalidMediaFilenameError],
    ["..\\evil.mp4", InvalidMediaFilenameError],
    ["C:\\Windows\\evil.mp4", InvalidMediaFilenameError],
    ["\\\\server\\share\\evil.mp4", InvalidMediaFilenameError],
    ["control\u0000.mp4", InvalidMediaFilenameError],
    [`${"a".repeat(201)}.mp4`, InvalidMediaFilenameError],
    ["video.exe", InvalidMediaFilenameError],
  ])("rejects unsafe display filename %j", async (filename, errorType) => {
    await expect(ingest(service(), { originalFilename: filename })).rejects.toBeInstanceOf(
      errorType,
    );
  });

  it("rejects empty, spoofed, unsupported, partial, and oversized bodies safely", async () => {
    await expect(
      ingest(service(), { source: mediaChunks(new Uint8Array()) }),
    ).rejects.toBeInstanceOf(InvalidMediaError);
    await expect(
      ingest(service(), { source: mediaChunks(new TextEncoder().encode("not an mp4")) }),
    ).rejects.toBeInstanceOf(InvalidMediaError);
    await expect(
      ingest(service(), { declaredMimeType: "application/octet-stream" }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeError);
    await expect(
      ingest(service(), { source: mediaChunks(validMp4.subarray(0, 8)) }),
    ).rejects.toBeInstanceOf(InvalidMediaError);
    await expect(ingest(service(undefined, undefined, 20))).rejects.toBeInstanceOf(
      MediaTooLargeError,
    );
  });

  it("deduplicates within a workspace but never across workspaces", async () => {
    const repository = new MemoryRepository();
    const storage = new MemoryStorage();
    const instance = service(repository, storage);
    const first = await ingest(instance);
    const duplicate = await ingest(instance, { originalFilename: "renamed.mp4" });
    const otherTenant = await ingest(instance, { context: mediaContext("ADMIN", mediaWorkspaceB) });

    expect(duplicate).toMatchObject({ mediaAssetId: first.mediaAssetId, duplicate: true });
    expect(otherTenant).toMatchObject({ duplicate: false });
    expect(otherTenant.mediaAssetId).not.toBe(first.mediaAssetId);
    expect(repository.assets.size).toBe(2);
    expect([...storage.objects.keys()].filter((key) => key.startsWith("original/"))).toHaveLength(
      2,
    );
  });

  it("handles simultaneous identical uploads with one record and one immutable object", async () => {
    const repository = new MemoryRepository();
    const storage = new MemoryStorage();
    const instance = service(repository, storage);
    const results = await Promise.all([ingest(instance), ingest(instance), ingest(instance)]);

    expect(new Set(results.map(({ mediaAssetId }) => mediaAssetId))).toHaveLength(1);
    expect(results.filter(({ duplicate }) => !duplicate)).toHaveLength(1);
    expect(repository.assets.size).toBe(1);
    expect([...storage.objects.keys()].filter((key) => key.startsWith("original/"))).toHaveLength(
      1,
    );
  });

  it("checks media.upload independently at the service boundary", async () => {
    await expect(ingest(service(), { context: mediaContext("VIEWER") })).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
  });

  it("cleans temporary data after database or finalization failure", async () => {
    const repository = new MemoryRepository();
    const storage = new MemoryStorage();
    repository.failFind = true;
    await expect(ingest(service(repository, storage))).rejects.toBeInstanceOf(
      MediaPersistenceFailureError,
    );
    expect(storage.objects).toHaveLength(0);

    repository.failFind = false;
    repository.failCreate = true;
    await expect(ingest(service(repository, storage))).rejects.toBeInstanceOf(
      MediaPersistenceFailureError,
    );
    expect(storage.objects).toHaveLength(0);

    repository.failCreate = false;
    storage.failPromotion = true;
    await expect(ingest(service(repository, storage))).rejects.toBeInstanceOf(
      MediaStorageFailureError,
    );
    expect(storage.objects).toHaveLength(0);
  });

  it("cleans partial writes after storage and incoming-stream interruption", async () => {
    const storage = new MemoryStorage();
    storage.failWrite = true;
    await expect(ingest(service(new MemoryRepository(), storage))).rejects.toBeInstanceOf(
      MediaStorageFailureError,
    );
    expect(storage.objects).toHaveLength(0);

    storage.failWrite = false;
    const interrupted = async function* () {
      yield validMp4.subarray(0, 12);
      throw new Error("client disconnected");
    };
    await expect(
      ingest(service(new MemoryRepository(), storage), { source: interrupted() }),
    ).rejects.toBeInstanceOf(MediaStorageFailureError);
    expect(storage.objects).toHaveLength(0);
  });

  it("keeps memory bounded to source chunk size for a large logical stream", async () => {
    const storage = new MemoryStorage();
    const bytes = new Uint8Array(1_024 * 1_000);
    bytes.set(validMp4);
    await ingest(service(new MemoryRepository(), storage, bytes.byteLength + 1), {
      source: mediaChunks(bytes, 1_024),
    });
    expect(storage.chunkCount).toBe(1_000);
    expect(storage.maximumObservedChunk).toBe(1_024);
    expect(createHash("sha256").update(bytes).digest("hex")).toHaveLength(64);
  });
});
