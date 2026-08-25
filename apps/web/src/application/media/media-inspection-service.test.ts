import { describe, expect, it } from "vitest";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";

import type { MediaAssetRecord, MediaInspectionRepositoryPort } from "./media-asset-repository";
import {
  MediaInspectionFailureError,
  MediaInspectionInProgressError,
  MediaInspectionTimeoutError,
  MediaNotFoundError,
  MediaPersistenceFailureError,
  MediaUnsupportedError,
} from "./media-errors";
import { MediaInspectionService } from "./media-inspection-service";
import {
  PermanentMediaInspectionError,
  TransientMediaInspectionError,
  type MediaInspector,
  type NormalizedMediaMetadata,
} from "./media-inspector";
import {
  mediaContext,
  mediaRequestId,
  mediaWorkspaceA,
  mediaWorkspaceB,
  silentMediaLogger,
} from "./media-test-fixtures";
import type {
  StoragePromotion,
  StorageProvider,
  StoredObjectStat,
  TemporaryStorageObject,
} from "./storage-provider";

const mediaAssetId = "018f1000-0000-7000-8000-000000000010";
const metadata: NormalizedMediaMetadata = {
  durationMs: 2_000n,
  width: 1080,
  height: 1920,
  fps: 29.97,
  bitrateBps: 4_000_000n,
  codec: "h264",
  audioCodec: "aac",
  orientation: "ROTATION_90",
};

const asset = (workspaceId = mediaWorkspaceA): MediaAssetRecord => ({
  id: mediaAssetId,
  workspaceId,
  originalFilename: "private-name.mp4",
  storageKey: `original/workspace/${workspaceId}/media/hash.mp4`,
  mimeType: "video/mp4",
  sizeBytes: 24n,
  sha256: new Uint8Array(32),
  status: "INGESTED",
  durationMs: null,
  width: null,
  height: null,
  fps: null,
  bitrateBps: null,
  codec: null,
  audioCodec: null,
  orientation: null,
  validationErrorCode: null,
  createdAt: new Date("2026-08-25T00:00:00.000Z"),
  updatedAt: new Date("2026-08-25T00:00:00.000Z"),
  version: 1,
});

class MemoryInspectionRepository implements MediaInspectionRepositoryPort {
  readonly assets = new Map<string, MediaAssetRecord>();
  failClaim = false;
  failComplete = false;

  private key(workspaceId: string, id: string): string {
    return `${workspaceId}:${id}`;
  }

  add(value: MediaAssetRecord): void {
    this.assets.set(this.key(value.workspaceId, value.id), value);
  }

  async findByWorkspaceAndId(workspaceId: string, id: string) {
    return this.assets.get(this.key(workspaceId, id)) ?? null;
  }

  async claimInspection(workspaceId: string, id: string, staleBefore: Date) {
    if (this.failClaim) throw new Error("database unavailable");
    const current = this.assets.get(this.key(workspaceId, id));
    if (current === undefined) return { state: "NOT_FOUND" } as const;
    if (current.status === "READY" || current.status === "REJECTED") {
      return { state: "FINAL", asset: current } as const;
    }
    if (current.status === "INSPECTING" && current.updatedAt > staleBefore) {
      return { state: "IN_PROGRESS" } as const;
    }
    if (!["INGESTED", "INSPECTION_FAILED", "INSPECTING"].includes(current.status)) {
      return { state: "BLOCKED" } as const;
    }
    const claimed: MediaAssetRecord = {
      ...current,
      status: "INSPECTING",
      validationErrorCode: null,
      updatedAt: new Date("2026-08-25T00:01:00.000Z"),
      version: current.version + 1,
    };
    this.add(claimed);
    return { state: "CLAIMED", asset: claimed } as const;
  }

  async completeInspection(
    input: Parameters<MediaInspectionRepositoryPort["completeInspection"]>[0],
  ) {
    if (this.failComplete) throw new Error("database unavailable");
    const current = this.assets.get(this.key(input.workspaceId, input.mediaAssetId));
    if (
      current === undefined ||
      current.status !== "INSPECTING" ||
      current.version !== input.claimedVersion
    ) {
      if (current === undefined) throw new Error("missing asset");
      return { asset: current, updated: false };
    }
    const value: MediaAssetRecord = {
      ...current,
      status: input.status,
      validationErrorCode: input.validationErrorCode,
      durationMs: input.metadata?.durationMs ?? null,
      width: input.metadata?.width ?? null,
      height: input.metadata?.height ?? null,
      fps: input.metadata?.fps ?? null,
      bitrateBps: input.metadata?.bitrateBps ?? null,
      codec: input.metadata?.codec ?? null,
      audioCodec: input.metadata?.audioCodec ?? null,
      orientation: input.metadata?.orientation ?? null,
      version: current.version + 1,
    };
    this.add(value);
    return { asset: value, updated: true };
  }
}

class MemoryReadStorage implements StorageProvider {
  openCount = 0;
  deleteCount = 0;
  failRead = false;

  async writeTemporary(): Promise<TemporaryStorageObject> {
    throw new Error("not used");
  }
  async promoteTemporary(): Promise<StoragePromotion> {
    throw new Error("not used");
  }
  async openRead(): Promise<AsyncIterable<Uint8Array>> {
    this.openCount += 1;
    if (this.failRead) throw new Error("storage unavailable");
    return {
      async *[Symbol.asyncIterator]() {
        yield Uint8Array.from([1, 2, 3]);
      },
    };
  }
  async stat(): Promise<StoredObjectStat | null> {
    return { sizeBytes: 3 };
  }
  async exists(): Promise<boolean> {
    return true;
  }
  async delete(): Promise<void> {
    this.deleteCount += 1;
  }
}

class StubInspector implements MediaInspector {
  calls = 0;
  behavior: () => Promise<NormalizedMediaMetadata> = async () => metadata;

  async inspect(): Promise<NormalizedMediaMetadata> {
    this.calls += 1;
    return this.behavior();
  }
}

const setup = () => {
  const repository = new MemoryInspectionRepository();
  const storage = new MemoryReadStorage();
  const inspector = new StubInspector();
  repository.add(asset());
  const service = new MediaInspectionService(
    repository,
    storage,
    inspector,
    60_000,
    silentMediaLogger,
    () => new Date("2026-08-25T00:01:30.000Z"),
  );
  return { repository, storage, inspector, service };
};

const inspect = (service: MediaInspectionService, workspaceId = mediaWorkspaceA) =>
  service.inspect({
    context: mediaContext("ADMIN", workspaceId),
    requestId: mediaRequestId,
    mediaAssetId,
  });

describe("MediaInspectionService", () => {
  it("persists normalized metadata atomically and returns no storage internals", async () => {
    const { repository, storage, inspector, service } = setup();
    const result = await inspect(service);
    expect(result).toEqual({
      mediaAssetId,
      status: "READY",
      ...metadata,
      durationMs: 2_000,
      bitrateBps: 4_000_000,
    });
    expect(result).not.toHaveProperty("storageKey");
    expect(repository.assets.values().next().value).toMatchObject({ status: "READY", version: 3 });
    expect(storage.openCount).toBe(1);
    expect(storage.deleteCount).toBe(0);
    expect(inspector.calls).toBe(1);
  });

  it("returns persisted READY metadata idempotently without rerunning FFprobe", async () => {
    const { inspector, service } = setup();
    const first = await inspect(service);
    const second = await inspect(service);
    expect(second).toEqual(first);
    expect(inspector.calls).toBe(1);
  });

  it("records permanent incompatibility without deleting the immutable original", async () => {
    const { repository, storage, inspector, service } = setup();
    inspector.behavior = async () => {
      throw new PermanentMediaInspectionError("UNSUPPORTED_VIDEO_CODEC");
    };
    await expect(inspect(service)).rejects.toBeInstanceOf(MediaUnsupportedError);
    expect(repository.assets.values().next().value).toMatchObject({
      status: "REJECTED",
      validationErrorCode: "UNSUPPORTED_VIDEO_CODEC",
      codec: null,
    });
    expect(storage.deleteCount).toBe(0);
    await expect(inspect(service)).rejects.toBeInstanceOf(MediaUnsupportedError);
    expect(inspector.calls).toBe(1);
  });

  it("records transient timeout and permits a deterministic retry", async () => {
    const { repository, inspector, service } = setup();
    inspector.behavior = async () => {
      throw new TransientMediaInspectionError("TIMEOUT");
    };
    await expect(inspect(service)).rejects.toBeInstanceOf(MediaInspectionTimeoutError);
    expect(repository.assets.values().next().value).toMatchObject({
      status: "INSPECTION_FAILED",
      validationErrorCode: "TIMEOUT",
    });
    inspector.behavior = async () => metadata;
    await expect(inspect(service)).resolves.toMatchObject({ status: "READY" });
    expect(inspector.calls).toBe(2);
  });

  it("fails closed for permission, malformed IDs, and cross-workspace guesses", async () => {
    const { inspector, service } = setup();
    await expect(
      service.inspect({ context: mediaContext("VIEWER"), requestId: mediaRequestId, mediaAssetId }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      service.inspect({
        context: mediaContext(),
        requestId: mediaRequestId,
        mediaAssetId: "../file",
      }),
    ).rejects.toBeInstanceOf(MediaNotFoundError);
    await expect(inspect(service, mediaWorkspaceB)).rejects.toBeInstanceOf(MediaNotFoundError);
    expect(inspector.calls).toBe(0);
  });

  it("allows only one concurrent inspection claim", async () => {
    const { inspector, service } = setup();
    let release: ((value: NormalizedMediaMetadata) => void) | undefined;
    inspector.behavior = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const first = inspect(service);
    while (release === undefined) await Promise.resolve();
    await expect(inspect(service)).rejects.toBeInstanceOf(MediaInspectionInProgressError);
    release(metadata);
    await expect(first).resolves.toMatchObject({ status: "READY" });
    expect(inspector.calls).toBe(1);
  });

  it("reclaims a stale INSPECTING claim using optimistic versioning", async () => {
    const { repository, service } = setup();
    repository.add({
      ...asset(),
      status: "INSPECTING",
      updatedAt: new Date("2026-08-24T23:59:00.000Z"),
      version: 4,
    });
    await expect(inspect(service)).resolves.toMatchObject({ status: "READY" });
    expect(repository.assets.values().next().value).toMatchObject({ status: "READY", version: 6 });
  });

  it("records storage failure and maps database failures safely", async () => {
    const { repository, storage, service } = setup();
    storage.failRead = true;
    await expect(inspect(service)).rejects.toBeInstanceOf(MediaInspectionFailureError);
    expect(repository.assets.values().next().value).toMatchObject({
      status: "INSPECTION_FAILED",
      validationErrorCode: "STORAGE_READ_FAILED",
    });

    const claimFailure = setup();
    claimFailure.repository.failClaim = true;
    await expect(inspect(claimFailure.service)).rejects.toBeInstanceOf(
      MediaPersistenceFailureError,
    );

    const completionFailure = setup();
    completionFailure.repository.failComplete = true;
    await expect(inspect(completionFailure.service)).rejects.toBeInstanceOf(
      MediaPersistenceFailureError,
    );
  });
});
