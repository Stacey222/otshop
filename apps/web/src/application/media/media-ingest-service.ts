import { createHash } from "node:crypto";

import {
  AuthenticatedContextSchema,
  MediaAssetIdSchema,
  createUuidV7,
  hasPermission,
  type AuthenticatedContext,
  type RequestId,
} from "@otshop/shared";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import { ApplicationError } from "@/application/errors/application-error";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import {
  InvalidMediaError,
  MediaPersistenceFailureError,
  MediaStorageFailureError,
  MediaTooLargeError,
} from "./media-errors";
import type { MediaAssetRecord, MediaAssetRepositoryPort } from "./media-asset-repository";
import {
  ACCEPTED_MEDIA_MIME_TYPE,
  MEDIA_SIGNATURE_BYTES,
  sanitizeOriginalFilename,
  validateDeclaredMediaType,
  validateMp4Signature,
} from "./media-validation";
import type { StorageProvider, StoragePromotion } from "./storage-provider";

export const INGESTED_MEDIA_STATUS = "INGESTED";

export interface MediaIngestResult {
  readonly mediaAssetId: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly createdAt: string;
  readonly duplicate: boolean;
}

interface InspectedStreamState {
  sizeBytes: number;
  signatureLength: number;
  readonly signature: Uint8Array;
  readonly hash: ReturnType<typeof createHash>;
}

const storageKeyFor = (workspaceId: string, sha256Hex: string): string =>
  `original/workspace/${workspaceId}/media/${sha256Hex}.mp4`;

export class MediaIngestService {
  constructor(
    private readonly repository: MediaAssetRepositoryPort,
    private readonly storage: StorageProvider,
    private readonly maxUploadBytes: number,
    private readonly log: ApplicationLogger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private authorize(context: AuthenticatedContext): AuthenticatedContext {
    const canonical = AuthenticatedContextSchema.parse(context);
    if (!hasPermission(canonical.role, "media.upload")) throw new AuthorizationDeniedError();
    return canonical;
  }

  private inspectedStream(
    source: AsyncIterable<Uint8Array>,
    state: InspectedStreamState,
  ): AsyncIterable<Uint8Array> {
    const limit = this.maxUploadBytes;
    return {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of source) {
          if (!(chunk instanceof Uint8Array)) throw new InvalidMediaError();
          if (chunk.byteLength === 0) continue;
          if (state.sizeBytes > limit - chunk.byteLength) throw new MediaTooLargeError();
          state.hash.update(chunk);
          const remaining = MEDIA_SIGNATURE_BYTES - state.signatureLength;
          if (remaining > 0) {
            const copied = Math.min(remaining, chunk.byteLength);
            state.signature.set(chunk.subarray(0, copied), state.signatureLength);
            state.signatureLength += copied;
          }
          state.sizeBytes += chunk.byteLength;
          yield chunk;
        }
      },
    };
  }

  private async deleteSafely(
    key: string,
    requestId: RequestId,
    workspaceId: string,
    stage: string,
  ): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      this.log.error("media.cleanup.failed", { requestId, workspaceId, operation: stage });
      throw new MediaStorageFailureError();
    }
  }

  private async storedObjectMatches(
    key: string,
    sizeBytes: number,
    sha256Hex: string,
  ): Promise<boolean> {
    const metadata = await this.storage.stat(key);
    if (metadata === null || metadata.sizeBytes !== sizeBytes) return false;
    const hash = createHash("sha256");
    let observed = 0;
    for await (const chunk of await this.storage.openRead(key)) {
      observed += chunk.byteLength;
      if (observed > sizeBytes) return false;
      hash.update(chunk);
    }
    return observed === sizeBytes && hash.digest("hex") === sha256Hex;
  }

  private result(asset: MediaAssetRecord, duplicate: boolean): MediaIngestResult {
    const sizeBytes = Number(asset.sizeBytes);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
      throw new MediaPersistenceFailureError();
    }
    return {
      mediaAssetId: asset.id,
      originalFilename: asset.originalFilename,
      mimeType: asset.mimeType,
      sizeBytes,
      sha256: Buffer.from(asset.sha256).toString("hex"),
      createdAt: asset.createdAt.toISOString(),
      duplicate,
    };
  }

  async ingest(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly originalFilename: string;
    readonly declaredMimeType: string;
    readonly source: AsyncIterable<Uint8Array>;
  }): Promise<MediaIngestResult> {
    const context = this.authorize(input.context);
    validateDeclaredMediaType(input.declaredMimeType);
    const originalFilename = sanitizeOriginalFilename(input.originalFilename);
    const startedAt = performance.now();
    const state: InspectedStreamState = {
      sizeBytes: 0,
      signatureLength: 0,
      signature: new Uint8Array(MEDIA_SIGNATURE_BYTES),
      hash: createHash("sha256"),
    };
    let temporaryKey: string | undefined;

    try {
      const temporary = await this.storage.writeTemporary(
        this.inspectedStream(input.source, state),
      );
      temporaryKey = temporary.key;
      if (state.sizeBytes === 0) throw new InvalidMediaError();
      validateMp4Signature(state.signature.subarray(0, state.signatureLength));
      const sha256Hex = state.hash.digest("hex");
      const sha256 = Uint8Array.from(Buffer.from(sha256Hex, "hex"));
      const storageKey = storageKeyFor(context.workspaceId, sha256Hex);

      let existing: MediaAssetRecord | null;
      try {
        existing = await this.repository.findByWorkspaceAndSha256(context.workspaceId, sha256);
      } catch {
        throw new MediaPersistenceFailureError();
      }
      if (existing !== null) {
        if (!(await this.storedObjectMatches(existing.storageKey, state.sizeBytes, sha256Hex))) {
          throw new MediaStorageFailureError();
        }
        await this.deleteSafely(
          temporaryKey,
          input.requestId,
          context.workspaceId,
          "duplicate-temporary",
        );
        temporaryKey = undefined;
        this.log.info("media.ingest.completed", {
          requestId: input.requestId,
          workspaceId: context.workspaceId,
          mediaAssetId: existing.id,
          sizeBytes: state.sizeBytes,
          contentHashPrefix: sha256Hex.slice(0, 12),
          result: "DUPLICATE",
          durationMs: Math.round(performance.now() - startedAt),
        });
        return this.result(existing, true);
      }

      let promotion: StoragePromotion;
      try {
        promotion = await this.storage.promoteTemporary(temporaryKey, storageKey);
        temporaryKey = undefined;
      } catch {
        throw new MediaStorageFailureError();
      }
      if (
        promotion === "EXISTS" &&
        !(await this.storedObjectMatches(storageKey, state.sizeBytes, sha256Hex))
      ) {
        throw new MediaStorageFailureError();
      }

      let persisted;
      try {
        persisted = await this.repository.createOrFind({
          id: MediaAssetIdSchema.parse(createUuidV7(this.clock().getTime())),
          workspaceId: context.workspaceId,
          originalFilename,
          storageKey,
          mimeType: ACCEPTED_MEDIA_MIME_TYPE,
          sizeBytes: BigInt(state.sizeBytes),
          sha256,
          status: INGESTED_MEDIA_STATUS,
        });
      } catch {
        try {
          const recovered = await this.repository.findByWorkspaceAndSha256(
            context.workspaceId,
            sha256,
          );
          if (recovered !== null) {
            this.log.info("media.ingest.completed", {
              requestId: input.requestId,
              workspaceId: context.workspaceId,
              mediaAssetId: recovered.id,
              sizeBytes: state.sizeBytes,
              contentHashPrefix: sha256Hex.slice(0, 12),
              result: "DUPLICATE_RECOVERY",
              durationMs: Math.round(performance.now() - startedAt),
            });
            return this.result(recovered, true);
          }
        } catch {
          throw new MediaPersistenceFailureError();
        }
        if (promotion === "CREATED") {
          await this.deleteSafely(
            storageKey,
            input.requestId,
            context.workspaceId,
            "database-compensation",
          );
        }
        throw new MediaPersistenceFailureError();
      }

      this.log.info("media.ingest.completed", {
        requestId: input.requestId,
        workspaceId: context.workspaceId,
        mediaAssetId: persisted.asset.id,
        sizeBytes: state.sizeBytes,
        contentHashPrefix: sha256Hex.slice(0, 12),
        result: persisted.created ? "CREATED" : "DUPLICATE_RACE",
        durationMs: Math.round(performance.now() - startedAt),
      });
      return this.result(persisted.asset, !persisted.created);
    } catch (error) {
      if (temporaryKey !== undefined) {
        await this.deleteSafely(temporaryKey, input.requestId, context.workspaceId, "temporary");
      }
      if (error instanceof ApplicationError) throw error;
      throw new MediaStorageFailureError();
    }
  }
}
