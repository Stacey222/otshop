import { describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";

import {
  jpegThumbnail,
  mediaContext,
  mediaRequestId,
  silentMediaLogger,
} from "./media-test-fixtures";
import type { MediaAssetRecord, MediaThumbnailRepositoryPort } from "./media-asset-repository";
import {
  MediaNotFoundError,
  MediaNotReadyError,
  ThumbnailGenerationFailedError,
  ThumbnailGenerationInProgressError,
  ThumbnailGenerationTimeoutError,
  ThumbnailPersistenceFailureError,
  ThumbnailStorageFailureError,
} from "./media-errors";
import {
  ThumbnailDerivativeError,
  type MediaDerivativeGenerator,
  type ThumbnailDerivative,
} from "./media-derivative-generator";
import { MediaThumbnailService } from "./media-thumbnail-service";
import type {
  StoragePromotion,
  StorageProvider,
  StoredObjectStat,
  TemporaryStorageObject,
} from "./storage-provider";

const mediaAssetId = "018f1000-0000-7000-8000-000000000010";
const workspaceA = "018f1000-0000-7000-8000-000000000001";
const workspaceB = "018f1000-0000-7000-8000-000000000002";
const originalKey = `original/workspace/${workspaceA}/media/${"a".repeat(64)}.mp4`;
const canonicalThumbnailKey = `thumbnails/workspace/${workspaceA}/media/${mediaAssetId}.jpg`;
const thumbnailBytes = jpegThumbnail(320, 180);

const asset = (overrides: Partial<MediaAssetRecord> = {}): MediaAssetRecord => ({
  id: mediaAssetId,
  workspaceId: workspaceA,
  originalFilename: "private-name.mp4",
  storageKey: originalKey,
  mimeType: "video/mp4",
  sizeBytes: 24n,
  sha256: new Uint8Array(32),
  status: "READY",
  durationMs: 10_000n,
  width: 1920,
  height: 1080,
  fps: 25,
  bitrateBps: 1_000_000n,
  codec: "h264",
  audioCodec: "aac",
  orientation: "ROTATION_0",
  thumbnailKey: null,
  thumbnailGenerationStartedAt: null,
  validationErrorCode: null,
  createdAt: new Date("2026-08-25T00:00:00.000Z"),
  updatedAt: new Date("2026-08-25T00:00:00.000Z"),
  version: 3,
  ...overrides,
});

class MemoryThumbnailRepository implements MediaThumbnailRepositoryPort {
  current: MediaAssetRecord | null = asset();
  failClaim = false;
  failComplete = false;
  failRelease = false;
  completeCalls = 0;

  async claimThumbnail(input: Parameters<MediaThumbnailRepositoryPort["claimThumbnail"]>[0]) {
    if (this.failClaim) throw new Error("database unavailable");
    const current = this.current;
    if (
      current === null ||
      current.id !== input.mediaAssetId ||
      current.workspaceId !== input.workspaceId
    ) {
      return { state: "NOT_FOUND" } as const;
    }
    if (current.thumbnailKey !== null) return { state: "EXISTING", asset: current } as const;
    if (current.status !== "READY") return { state: "NOT_READY" } as const;
    if (
      current.thumbnailGenerationStartedAt !== null &&
      current.thumbnailGenerationStartedAt > input.staleBefore
    ) {
      return { state: "IN_PROGRESS" } as const;
    }
    this.current = {
      ...current,
      thumbnailGenerationStartedAt: input.startedAt,
      version: current.version + 1,
    };
    return { state: "CLAIMED", asset: this.current } as const;
  }

  async completeThumbnail(input: Parameters<MediaThumbnailRepositoryPort["completeThumbnail"]>[0]) {
    this.completeCalls += 1;
    if (this.failComplete) throw new Error("database unavailable");
    const current = this.current;
    if (current === null) throw new Error("missing asset");
    if (
      current.version !== input.claimedVersion ||
      current.thumbnailGenerationStartedAt === null ||
      current.thumbnailKey !== null
    ) {
      return { asset: current, updated: false };
    }
    this.current = {
      ...current,
      thumbnailKey: input.thumbnailKey,
      thumbnailGenerationStartedAt: null,
      version: current.version + 1,
    };
    return { asset: this.current, updated: true };
  }

  async releaseThumbnailClaim(
    input: Parameters<MediaThumbnailRepositoryPort["releaseThumbnailClaim"]>[0],
  ) {
    if (this.failRelease) throw new Error("database unavailable");
    const current = this.current;
    if (
      current === null ||
      current.version !== input.claimedVersion ||
      current.thumbnailGenerationStartedAt === null
    ) {
      return false;
    }
    this.current = {
      ...current,
      thumbnailGenerationStartedAt: null,
      version: current.version + 1,
    };
    return true;
  }
}

class MemoryThumbnailStorage implements StorageProvider {
  readonly objects = new Map<string, Uint8Array>([[originalKey, Uint8Array.from([1, 2, 3])]]);
  temporaryCounter = 0;
  failWrite = false;
  failPromotion = false;
  failDelete = false;
  promotionRace = false;
  originalDeleteCount = 0;

  async writeTemporary(source: AsyncIterable<Uint8Array>): Promise<TemporaryStorageObject> {
    if (this.failWrite) throw new Error("storage unavailable");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of source) {
      chunks.push(Uint8Array.from(chunk));
      size += chunk.byteLength;
    }
    const key = `temporary/${++this.temporaryCounter}.part`;
    this.objects.set(key, Buffer.concat(chunks, size));
    return { key };
  }

  async promoteTemporary(temporaryKey: string, finalKey: string): Promise<StoragePromotion> {
    if (this.failPromotion) throw new Error("promotion unavailable");
    if (this.promotionRace) {
      this.objects.set(finalKey, thumbnailBytes);
      this.objects.delete(temporaryKey);
      return "EXISTS";
    }
    if (this.objects.has(finalKey)) {
      this.objects.delete(temporaryKey);
      return "EXISTS";
    }
    const bytes = this.objects.get(temporaryKey);
    if (bytes === undefined) throw new Error("temporary missing");
    this.objects.set(finalKey, bytes);
    this.objects.delete(temporaryKey);
    return "CREATED";
  }

  async openRead(key: string): Promise<AsyncIterable<Uint8Array>> {
    const bytes = this.objects.get(key);
    if (bytes === undefined) throw new Error("object missing");
    return {
      async *[Symbol.asyncIterator]() {
        yield bytes;
      },
    };
  }

  async stat(key: string): Promise<StoredObjectStat | null> {
    const bytes = this.objects.get(key);
    return bytes === undefined ? null : { sizeBytes: bytes.byteLength };
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async delete(key: string): Promise<void> {
    if (key.startsWith("original/")) this.originalDeleteCount += 1;
    if (this.failDelete) throw new Error("cleanup unavailable");
    this.objects.delete(key);
  }
}

class StubThumbnailGenerator implements MediaDerivativeGenerator {
  calls = 0;
  behavior: () => Promise<ThumbnailDerivative> = async () => ({
    bytes: thumbnailBytes,
    height: 180,
    mimeType: "image/jpeg",
    width: 320,
  });

  async generateThumbnail(input: {
    readonly durationMs: bigint;
    readonly source: AsyncIterable<Uint8Array>;
  }): Promise<ThumbnailDerivative> {
    for await (const _chunk of input.source) void _chunk;
    this.calls += 1;
    return this.behavior();
  }
}

const setup = () => {
  const repository = new MemoryThumbnailRepository();
  const storage = new MemoryThumbnailStorage();
  const generator = new StubThumbnailGenerator();
  const service = new MediaThumbnailService(
    repository,
    storage,
    generator,
    1_024,
    640,
    60_000,
    silentMediaLogger,
    () => new Date("2026-08-25T00:02:00.000Z"),
  );
  return { generator, repository, service, storage };
};

const generate = (
  service: MediaThumbnailService,
  overrides: Partial<Parameters<MediaThumbnailService["generate"]>[0]> = {},
) =>
  service.generate({
    context: mediaContext("ADMIN", workspaceA),
    requestId: mediaRequestId,
    mediaAssetId,
    ...overrides,
  });

describe("MediaThumbnailService", () => {
  it("generates one validated canonical thumbnail and persists only its internal key", async () => {
    const { generator, repository, service, storage } = setup();
    await expect(generate(service)).resolves.toEqual({
      generated: true,
      height: 180,
      mediaAssetId,
      mimeType: "image/jpeg",
      sizeBytes: thumbnailBytes.byteLength,
      thumbnailAvailable: true,
      width: 320,
    });
    expect(repository.current).toMatchObject({
      thumbnailKey: canonicalThumbnailKey,
      thumbnailGenerationStartedAt: null,
      version: 5,
    });
    expect(Buffer.from(storage.objects.get(canonicalThumbnailKey) ?? [])).toEqual(
      Buffer.from(thumbnailBytes),
    );
    expect(storage.objects.get(originalKey)).toEqual(Uint8Array.from([1, 2, 3]));
    expect(storage.originalDeleteCount).toBe(0);
    expect(generator.calls).toBe(1);
  });

  it("returns an existing valid canonical derivative without invoking FFmpeg", async () => {
    const { generator, service, storage } = setup();
    await generate(service);
    await expect(generate(service)).resolves.toMatchObject({ generated: false });
    expect(generator.calls).toBe(1);
    expect(storage.objects.has(canonicalThumbnailKey)).toBe(true);
  });

  it.each(["INGESTED", "INSPECTING", "REJECTED", "INSPECTION_FAILED", "UNKNOWN"])(
    "rejects non-READY status %s",
    async (status) => {
      const { generator, repository, service } = setup();
      repository.current = asset({ status: status as MediaAssetRecord["status"] });
      await expect(generate(service)).rejects.toBeInstanceOf(MediaNotReadyError);
      expect(generator.calls).toBe(0);
    },
  );

  it("fails closed for invalid, null-like, unauthorized, and cross-workspace identifiers", async () => {
    const { service } = setup();
    await expect(generate(service, { mediaAssetId: "invalid" })).rejects.toBeInstanceOf(
      MediaNotFoundError,
    );
    await expect(
      generate(service, { mediaAssetId: undefined as unknown as string }),
    ).rejects.toBeInstanceOf(MediaNotFoundError);
    await expect(
      generate(service, { context: mediaContext("VIEWER", workspaceA) }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      generate(service, { context: mediaContext("ADMIN", workspaceB) }),
    ).rejects.toBeInstanceOf(MediaNotFoundError);
  });

  it("allows one concurrent claim and rejects the second without arbitrary sleeps", async () => {
    const { generator, repository, service } = setup();
    let entered: (() => void) | undefined;
    let release: (() => void) | undefined;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    generator.behavior = async () => {
      entered?.();
      await releasePromise;
      return { bytes: thumbnailBytes, height: 180, mimeType: "image/jpeg", width: 320 };
    };
    const first = generate(service);
    await enteredPromise;
    await expect(generate(service)).rejects.toBeInstanceOf(ThumbnailGenerationInProgressError);
    release?.();
    await expect(first).resolves.toMatchObject({ thumbnailAvailable: true });
    expect(generator.calls).toBe(1);
    expect(repository.current?.thumbnailKey).toBe(canonicalThumbnailKey);
  });

  it("reclaims a stale claim while a fresh claim remains in progress", async () => {
    const { generator, repository, service } = setup();
    repository.current = asset({
      thumbnailGenerationStartedAt: new Date("2026-08-25T00:00:00.000Z"),
      version: 4,
    });
    await expect(generate(service)).resolves.toMatchObject({ thumbnailAvailable: true });
    expect(generator.calls).toBe(1);

    const fresh = setup();
    fresh.repository.current = asset({
      thumbnailGenerationStartedAt: new Date("2026-08-25T00:01:30.001Z"),
      version: 4,
    });
    await expect(generate(fresh.service)).rejects.toBeInstanceOf(
      ThumbnailGenerationInProgressError,
    );
  });

  it("fails safely when a corrupt READY record has no inspected duration", async () => {
    const { generator, repository, service } = setup();
    repository.current = asset({ durationMs: null });
    await expect(generate(service)).rejects.toBeInstanceOf(ThumbnailGenerationFailedError);
    expect(generator.calls).toBe(0);
    expect(repository.current.thumbnailGenerationStartedAt).toBeNull();
  });

  it("maps claim database failure without opening storage or invoking FFmpeg", async () => {
    const { generator, repository, service, storage } = setup();
    repository.failClaim = true;
    await expect(generate(service)).rejects.toBeInstanceOf(ThumbnailPersistenceFailureError);
    expect(generator.calls).toBe(0);
    expect(storage.temporaryCounter).toBe(0);
  });

  it.each([
    ["TIMEOUT", ThumbnailGenerationTimeoutError],
    ["PROCESS_FAILED", ThumbnailGenerationFailedError],
    ["OUTPUT_LIMIT_EXCEEDED", ThumbnailGenerationFailedError],
    ["INPUT_READ_FAILED", ThumbnailGenerationFailedError],
    ["SYSTEM_FAILURE", ThumbnailGenerationFailedError],
  ] as const)("maps generator failure %s safely and releases its claim", async (code, type) => {
    const { generator, repository, service, storage } = setup();
    generator.behavior = async () => {
      throw new ThumbnailDerivativeError(code);
    };
    await expect(generate(service)).rejects.toBeInstanceOf(type);
    expect(repository.current?.thumbnailGenerationStartedAt).toBeNull();
    expect(storage.objects.has(canonicalThumbnailKey)).toBe(false);
    expect(storage.originalDeleteCount).toBe(0);
  });

  it("rejects malformed generator output defensively", async () => {
    const { generator, repository, service } = setup();
    generator.behavior = async () => ({
      bytes: Uint8Array.from([1, 2, 3]),
      height: 1,
      mimeType: "image/jpeg",
      width: 1,
    });
    await expect(generate(service)).rejects.toBeInstanceOf(ThumbnailGenerationFailedError);
    expect(repository.current?.thumbnailGenerationStartedAt).toBeNull();
  });

  it("compensates write and promotion failure without touching the original", async () => {
    const write = setup();
    write.storage.failWrite = true;
    await expect(generate(write.service)).rejects.toBeInstanceOf(ThumbnailStorageFailureError);
    expect(write.repository.current?.thumbnailGenerationStartedAt).toBeNull();

    const promotion = setup();
    promotion.storage.failPromotion = true;
    await expect(generate(promotion.service)).rejects.toBeInstanceOf(ThumbnailStorageFailureError);
    expect(
      [...promotion.storage.objects.keys()].filter((key) => key.startsWith("temporary/")),
    ).toEqual([]);
    expect(promotion.storage.originalDeleteCount).toBe(0);
  });

  it("converges on a canonical object created by a promotion race", async () => {
    const { generator, repository, service, storage } = setup();
    storage.promotionRace = true;
    await expect(generate(service)).resolves.toMatchObject({ generated: false });
    expect(repository.current?.thumbnailKey).toBe(canonicalThumbnailKey);
    expect(generator.calls).toBe(1);
    expect([...storage.objects.keys()].filter((key) => key.startsWith("thumbnails/"))).toHaveLength(
      1,
    );
  });

  it("preserves a promoted orphan after persistence failure and reconciles without FFmpeg", async () => {
    const { generator, repository, service, storage } = setup();
    repository.failComplete = true;
    await expect(generate(service)).rejects.toBeInstanceOf(ThumbnailPersistenceFailureError);
    expect(storage.objects.has(canonicalThumbnailKey)).toBe(true);
    expect(repository.current?.thumbnailKey).toBeNull();
    expect(repository.current?.thumbnailGenerationStartedAt).not.toBeNull();

    repository.failComplete = false;
    repository.current = {
      ...repository.current!,
      thumbnailGenerationStartedAt: new Date("2026-08-25T00:00:00.000Z"),
    };
    await expect(generate(service)).resolves.toMatchObject({ generated: false });
    expect(generator.calls).toBe(1);
    expect(repository.current?.thumbnailKey).toBe(canonicalThumbnailKey);
  });

  it("reports cleanup ambiguity safely without deleting immutable content", async () => {
    const { repository, service, storage } = setup();
    storage.failPromotion = true;
    storage.failDelete = true;
    await expect(generate(service)).rejects.toBeInstanceOf(ThumbnailStorageFailureError);
    expect(repository.current?.thumbnailGenerationStartedAt).toBeNull();
    expect(storage.objects.get(originalKey)).toEqual(Uint8Array.from([1, 2, 3]));
    expect(storage.originalDeleteCount).toBe(0);
  });
});
