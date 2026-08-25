import {
  AuthenticatedContextSchema,
  MediaAssetIdSchema,
  hasPermission,
  type AuthenticatedContext,
  type MediaInspectionFailureCode,
  type RequestId,
} from "@otshop/shared";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import type { MediaAssetRecord, MediaInspectionRepositoryPort } from "./media-asset-repository";
import {
  MediaInspectionFailureError,
  MediaInspectionInProgressError,
  MediaInspectionTimeoutError,
  MediaNotFoundError,
  MediaPersistenceFailureError,
  MediaUnsupportedError,
} from "./media-errors";
import {
  PermanentMediaInspectionError,
  TransientMediaInspectionError,
  type MediaInspector,
  type NormalizedMediaMetadata,
} from "./media-inspector";
import type { StorageProvider } from "./storage-provider";

export interface MediaInspectionResult {
  readonly mediaAssetId: string;
  readonly status: "READY";
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly bitrateBps: number | null;
  readonly codec: string;
  readonly audioCodec: string | null;
  readonly orientation: string;
}

export class MediaInspectionService {
  constructor(
    private readonly repository: MediaInspectionRepositoryPort,
    private readonly storage: StorageProvider,
    private readonly inspector: MediaInspector,
    private readonly inspectionStaleMs: number,
    private readonly log: ApplicationLogger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private authorize(context: AuthenticatedContext): AuthenticatedContext {
    const canonical = AuthenticatedContextSchema.parse(context);
    if (!hasPermission(canonical.role, "media.upload")) throw new AuthorizationDeniedError();
    return canonical;
  }

  private result(asset: MediaAssetRecord): MediaInspectionResult {
    if (
      asset.status !== "READY" ||
      asset.durationMs === null ||
      asset.width === null ||
      asset.height === null ||
      asset.fps === null ||
      asset.codec === null ||
      asset.orientation === null
    ) {
      throw new MediaPersistenceFailureError();
    }
    const durationMs = Number(asset.durationMs);
    const bitrateBps = asset.bitrateBps === null ? null : Number(asset.bitrateBps);
    if (!Number.isSafeInteger(durationMs) || !Number.isSafeInteger(bitrateBps ?? 0)) {
      throw new MediaPersistenceFailureError();
    }
    return {
      mediaAssetId: asset.id,
      status: "READY",
      durationMs,
      width: asset.width,
      height: asset.height,
      fps: asset.fps,
      bitrateBps,
      codec: asset.codec,
      audioCodec: asset.audioCodec,
      orientation: asset.orientation,
    };
  }

  private async persist(
    asset: MediaAssetRecord,
    status: "READY" | "REJECTED" | "INSPECTION_FAILED",
    validationErrorCode: MediaInspectionFailureCode | null,
    metadata: NormalizedMediaMetadata | null,
  ): Promise<MediaAssetRecord> {
    try {
      const completed = await this.repository.completeInspection({
        workspaceId: asset.workspaceId,
        mediaAssetId: asset.id,
        claimedVersion: asset.version,
        status,
        validationErrorCode,
        metadata,
      });
      if (completed.updated) return completed.asset;
      if (completed.asset.status === "READY" || completed.asset.status === "REJECTED") {
        return completed.asset;
      }
      throw new MediaPersistenceFailureError();
    } catch (error) {
      if (error instanceof MediaPersistenceFailureError) throw error;
      throw new MediaPersistenceFailureError();
    }
  }

  async inspect(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly mediaAssetId: string;
  }): Promise<MediaInspectionResult> {
    const context = this.authorize(input.context);
    const parsedId = MediaAssetIdSchema.safeParse(input.mediaAssetId);
    if (!parsedId.success) throw new MediaNotFoundError();
    const startedAt = performance.now();
    let claim;
    try {
      claim = await this.repository.claimInspection(
        context.workspaceId,
        parsedId.data,
        new Date(this.clock().getTime() - this.inspectionStaleMs),
      );
    } catch {
      throw new MediaPersistenceFailureError();
    }
    if (claim.state === "NOT_FOUND") throw new MediaNotFoundError();
    if (claim.state === "IN_PROGRESS") throw new MediaInspectionInProgressError();
    if (claim.state === "BLOCKED") throw new MediaInspectionFailureError();
    if (claim.state === "FINAL") {
      if (claim.asset.status === "REJECTED") throw new MediaUnsupportedError();
      return this.result(claim.asset);
    }

    if (!("asset" in claim)) throw new MediaInspectionFailureError();
    const asset = claim.asset;
    try {
      let source: AsyncIterable<Uint8Array>;
      try {
        source = await this.storage.openRead(asset.storageKey);
      } catch {
        throw new TransientMediaInspectionError("STORAGE_READ_FAILED");
      }
      const metadata = await this.inspector.inspect(source);
      const persisted = await this.persist(asset, "READY", null, metadata);
      if (persisted.status === "REJECTED") throw new MediaUnsupportedError();
      this.log.info("media.inspection.completed", {
        requestId: input.requestId,
        workspaceId: context.workspaceId,
        mediaAssetId: asset.id,
        outcome: "READY",
        durationMs: Math.round(performance.now() - startedAt),
        codec: metadata.codec,
        width: metadata.width,
        height: metadata.height,
      });
      return this.result(persisted);
    } catch (error) {
      if (error instanceof MediaPersistenceFailureError || error instanceof MediaUnsupportedError) {
        throw error;
      }
      if (error instanceof PermanentMediaInspectionError) {
        await this.persist(asset, "REJECTED", error.code, null);
        this.log.warn("media.inspection.rejected", {
          requestId: input.requestId,
          workspaceId: context.workspaceId,
          mediaAssetId: asset.id,
          outcome: error.code,
          durationMs: Math.round(performance.now() - startedAt),
        });
        throw new MediaUnsupportedError();
      }
      const code = error instanceof TransientMediaInspectionError ? error.code : "SYSTEM_FAILURE";
      await this.persist(asset, "INSPECTION_FAILED", code, null);
      this.log.error("media.inspection.failed", {
        requestId: input.requestId,
        workspaceId: context.workspaceId,
        mediaAssetId: asset.id,
        outcome: code,
        durationMs: Math.round(performance.now() - startedAt),
      });
      if (code === "TIMEOUT") throw new MediaInspectionTimeoutError();
      throw new MediaInspectionFailureError();
    }
  }
}
