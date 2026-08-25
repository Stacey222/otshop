import {
  AuthenticatedContextSchema,
  MediaAssetIdSchema,
  hasPermission,
  type AuthenticatedContext,
  type RequestId,
} from "@otshop/shared";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import { validateJpegThumbnail } from "./jpeg-thumbnail";
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
import type { StorageProvider } from "./storage-provider";

export interface MediaThumbnailResult {
  readonly generated: boolean;
  readonly height: number;
  readonly mediaAssetId: string;
  readonly mimeType: "image/jpeg";
  readonly sizeBytes: number;
  readonly thumbnailAvailable: true;
  readonly width: number;
}

const oneChunk = async function* (bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
};

export class MediaThumbnailService {
  constructor(
    private readonly repository: MediaThumbnailRepositoryPort,
    private readonly storage: StorageProvider,
    private readonly generator: MediaDerivativeGenerator,
    private readonly maximumBytes: number,
    private readonly maximumDimension: number,
    private readonly claimStaleMs: number,
    private readonly log: ApplicationLogger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private authorize(context: AuthenticatedContext): AuthenticatedContext {
    const canonical = AuthenticatedContextSchema.parse(context);
    if (!hasPermission(canonical.role, "media.upload")) throw new AuthorizationDeniedError();
    return canonical;
  }

  private canonicalKey(asset: MediaAssetRecord): string {
    return `thumbnails/workspace/${asset.workspaceId}/media/${asset.id}.jpg`;
  }

  private async readAndValidate(key: string): Promise<ThumbnailDerivative> {
    try {
      const source = await this.storage.openRead(key);
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of source) {
        size += chunk.byteLength;
        if (size > this.maximumBytes) throw new ThumbnailStorageFailureError();
        chunks.push(Uint8Array.from(chunk));
      }
      const bytes = Buffer.concat(chunks, size);
      return validateJpegThumbnail(bytes, this.maximumBytes, this.maximumDimension);
    } catch (error) {
      if (error instanceof ThumbnailStorageFailureError) throw error;
      throw new ThumbnailStorageFailureError();
    }
  }

  private result(
    asset: MediaAssetRecord,
    derivative: ThumbnailDerivative,
    generated: boolean,
  ): MediaThumbnailResult {
    if (asset.thumbnailKey !== this.canonicalKey(asset)) {
      throw new ThumbnailPersistenceFailureError();
    }
    return {
      generated,
      height: derivative.height,
      mediaAssetId: asset.id,
      mimeType: "image/jpeg",
      sizeBytes: derivative.bytes.byteLength,
      thumbnailAvailable: true,
      width: derivative.width,
    };
  }

  private async release(asset: MediaAssetRecord, requestId: RequestId): Promise<void> {
    try {
      await this.repository.releaseThumbnailClaim({
        workspaceId: asset.workspaceId,
        mediaAssetId: asset.id,
        claimedVersion: asset.version,
      });
    } catch {
      this.log.warn("media.thumbnail.claim_release_failed", {
        requestId,
        workspaceId: asset.workspaceId,
        mediaAssetId: asset.id,
        outcome: "RECONCILIATION_REQUIRED",
      });
    }
  }

  private async persist(asset: MediaAssetRecord, thumbnailKey: string): Promise<MediaAssetRecord> {
    try {
      const completed = await this.repository.completeThumbnail({
        workspaceId: asset.workspaceId,
        mediaAssetId: asset.id,
        claimedVersion: asset.version,
        thumbnailKey,
      });
      if (completed.updated || completed.asset.thumbnailKey === thumbnailKey) {
        return completed.asset;
      }
      throw new ThumbnailPersistenceFailureError();
    } catch (error) {
      if (error instanceof ThumbnailPersistenceFailureError) throw error;
      throw new ThumbnailPersistenceFailureError();
    }
  }

  async generate(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly mediaAssetId: string;
  }): Promise<MediaThumbnailResult> {
    const context = this.authorize(input.context);
    const parsedId = MediaAssetIdSchema.safeParse(input.mediaAssetId);
    if (!parsedId.success) throw new MediaNotFoundError();
    const startedAt = performance.now();
    const now = this.clock();
    let claim;
    try {
      claim = await this.repository.claimThumbnail({
        workspaceId: context.workspaceId,
        mediaAssetId: parsedId.data,
        staleBefore: new Date(now.getTime() - this.claimStaleMs),
        startedAt: now,
      });
    } catch {
      throw new ThumbnailPersistenceFailureError();
    }
    if (claim.state === "NOT_FOUND") throw new MediaNotFoundError();
    if (claim.state === "NOT_READY") throw new MediaNotReadyError();
    if (claim.state === "IN_PROGRESS") throw new ThumbnailGenerationInProgressError();
    if (!("asset" in claim)) throw new ThumbnailPersistenceFailureError();

    const asset = claim.asset;
    const thumbnailKey = this.canonicalKey(asset);
    if (claim.state === "EXISTING") {
      if (asset.thumbnailKey !== thumbnailKey) throw new ThumbnailPersistenceFailureError();
      const derivative = await this.readAndValidate(thumbnailKey);
      return this.result(asset, derivative, false);
    }

    let temporaryKey: string | undefined;
    let canonicalObjectExists = false;
    let createdByRequest = false;
    try {
      let derivative: ThumbnailDerivative;
      try {
        if (await this.storage.exists(thumbnailKey)) {
          canonicalObjectExists = true;
          derivative = await this.readAndValidate(thumbnailKey);
        } else {
          if (asset.durationMs === null) throw new ThumbnailGenerationFailedError();
          let source: AsyncIterable<Uint8Array>;
          try {
            source = await this.storage.openRead(asset.storageKey);
          } catch {
            throw new ThumbnailStorageFailureError();
          }
          derivative = await this.generator.generateThumbnail({
            durationMs: asset.durationMs,
            source,
          });
          derivative = validateJpegThumbnail(
            derivative.bytes,
            this.maximumBytes,
            this.maximumDimension,
          );
          const temporary = await this.storage.writeTemporary(oneChunk(derivative.bytes));
          temporaryKey = temporary.key;
          const promotion = await this.storage.promoteTemporary(temporaryKey, thumbnailKey);
          temporaryKey = undefined;
          canonicalObjectExists = true;
          createdByRequest = promotion === "CREATED";
          if (promotion === "EXISTS") derivative = await this.readAndValidate(thumbnailKey);
        }
      } catch (error) {
        if (
          error instanceof ThumbnailGenerationFailedError ||
          error instanceof ThumbnailStorageFailureError
        ) {
          throw error;
        }
        if (error instanceof ThumbnailDerivativeError) {
          if (error.code === "TIMEOUT") throw new ThumbnailGenerationTimeoutError();
          throw new ThumbnailGenerationFailedError();
        }
        throw new ThumbnailStorageFailureError();
      }

      const persisted = await this.persist(asset, thumbnailKey);
      this.log.info("media.thumbnail.completed", {
        requestId: input.requestId,
        workspaceId: context.workspaceId,
        mediaAssetId: asset.id,
        outcome: "AVAILABLE",
        durationMs: Math.round(performance.now() - startedAt),
        thumbnailSizeBytes: derivative.bytes.byteLength,
        thumbnailWidth: derivative.width,
        thumbnailHeight: derivative.height,
      });
      return this.result(persisted, derivative, createdByRequest);
    } catch (error) {
      if (temporaryKey !== undefined) {
        try {
          await this.storage.delete(temporaryKey);
        } catch {
          this.log.warn("media.thumbnail.temporary_cleanup_failed", {
            requestId: input.requestId,
            workspaceId: context.workspaceId,
            mediaAssetId: asset.id,
            outcome: "CLEANUP_REQUIRED",
          });
        }
      }
      if (!canonicalObjectExists) await this.release(asset, input.requestId);
      this.log.error("media.thumbnail.failed", {
        requestId: input.requestId,
        workspaceId: context.workspaceId,
        mediaAssetId: asset.id,
        outcome: error instanceof Error ? error.name : "UNKNOWN",
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw error;
    }
  }
}
