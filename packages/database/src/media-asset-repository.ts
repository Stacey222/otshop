import { Prisma, PrismaClient, type MediaAsset } from "@prisma/client";
import {
  MediaInspectionFailureCodeSchema,
  MediaInspectionStatusSchema,
  MediaOrientationSchema,
  type MediaInspectionFailureCode,
  type MediaInspectionStatus,
  type MediaOrientation,
} from "@otshop/shared";

import { getDatabaseClient } from "./client";

export interface MediaAssetRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly originalFilename: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: bigint;
  readonly sha256: Uint8Array;
  readonly status: MediaInspectionStatus;
  readonly durationMs: bigint | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly fps: number | null;
  readonly bitrateBps: bigint | null;
  readonly codec: string | null;
  readonly audioCodec: string | null;
  readonly orientation: MediaOrientation | null;
  readonly thumbnailKey: string | null;
  readonly thumbnailGenerationStartedAt: Date | null;
  readonly validationErrorCode: MediaInspectionFailureCode | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export interface CreateMediaAssetInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly originalFilename: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: bigint;
  readonly sha256: Uint8Array;
  readonly status: MediaInspectionStatus;
}

const toRecord = (asset: MediaAsset): MediaAssetRecord => ({
  id: asset.id,
  workspaceId: asset.workspaceId,
  originalFilename: asset.originalFilename,
  storageKey: asset.storageKey,
  mimeType: asset.mimeType,
  sizeBytes: asset.sizeBytes,
  sha256: Uint8Array.from(asset.sha256),
  status: MediaInspectionStatusSchema.parse(asset.status),
  durationMs: asset.durationMs,
  width: asset.width,
  height: asset.height,
  fps: asset.fps?.toNumber() ?? null,
  bitrateBps: asset.bitrateBps,
  codec: asset.codec,
  audioCodec: asset.audioCodec,
  orientation: asset.orientation === null ? null : MediaOrientationSchema.parse(asset.orientation),
  thumbnailKey: asset.thumbnailKey,
  thumbnailGenerationStartedAt: asset.thumbnailGenerationStartedAt,
  validationErrorCode:
    asset.validationErrorCode === null
      ? null
      : MediaInspectionFailureCodeSchema.parse(asset.validationErrorCode),
  createdAt: asset.createdAt,
  updatedAt: asset.updatedAt,
  version: asset.version,
});

const isUniqueConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export class MediaAssetRepository {
  constructor(private readonly client: PrismaClient = getDatabaseClient()) {}

  async findByWorkspaceAndSha256(
    workspaceId: string,
    sha256: Uint8Array,
  ): Promise<MediaAssetRecord | null> {
    const asset = await this.client.mediaAsset.findUnique({
      where: {
        workspaceId_sha256: { workspaceId, sha256: Uint8Array.from(sha256) },
      },
    });
    return asset === null ? null : toRecord(asset);
  }

  async findByWorkspaceAndId(
    workspaceId: string,
    mediaAssetId: string,
  ): Promise<MediaAssetRecord | null> {
    const asset = await this.client.mediaAsset.findUnique({
      where: { workspaceId_id: { workspaceId, id: mediaAssetId } },
    });
    return asset === null ? null : toRecord(asset);
  }

  async createOrFind(input: CreateMediaAssetInput): Promise<{
    readonly asset: MediaAssetRecord;
    readonly created: boolean;
  }> {
    try {
      const asset = await this.client.mediaAsset.create({
        data: {
          id: input.id,
          workspaceId: input.workspaceId,
          source: "MANUAL_UPLOAD",
          originalFilename: input.originalFilename,
          storageKey: input.storageKey,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          sha256: Uint8Array.from(input.sha256),
          status: MediaInspectionStatusSchema.parse(input.status),
        },
      });
      return { asset: toRecord(asset), created: true };
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const existing = await this.findByWorkspaceAndSha256(input.workspaceId, input.sha256);
      if (existing === null) throw error;
      return { asset: existing, created: false };
    }
  }

  async claimInspection(
    workspaceId: string,
    mediaAssetId: string,
    staleBefore: Date,
  ): Promise<
    | { readonly state: "CLAIMED" | "FINAL"; readonly asset: MediaAssetRecord }
    | { readonly state: "BLOCKED" | "IN_PROGRESS" | "NOT_FOUND" }
  > {
    return this.client.$transaction(async (transaction) => {
      const current = await transaction.mediaAsset.findUnique({
        where: { workspaceId_id: { workspaceId, id: mediaAssetId } },
      });
      if (current === null) return { state: "NOT_FOUND" } as const;
      if (current.status === "READY" || current.status === "REJECTED") {
        return { state: "FINAL", asset: toRecord(current) } as const;
      }
      const staleInspection = current.status === "INSPECTING" && current.updatedAt <= staleBefore;
      if (current.status === "INSPECTING" && !staleInspection) {
        return { state: "IN_PROGRESS" } as const;
      }
      if (
        current.status !== "INGESTED" &&
        current.status !== "INSPECTION_FAILED" &&
        !staleInspection
      ) {
        return { state: "BLOCKED" } as const;
      }
      const claimed = await transaction.mediaAsset.updateMany({
        where: {
          id: mediaAssetId,
          workspaceId,
          version: current.version,
          status: current.status,
        },
        data: {
          status: "INSPECTING",
          validationErrorCode: null,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) return { state: "IN_PROGRESS" } as const;
      const asset = await transaction.mediaAsset.findUniqueOrThrow({
        where: { workspaceId_id: { workspaceId, id: mediaAssetId } },
      });
      return { state: "CLAIMED", asset: toRecord(asset) } as const;
    });
  }

  async completeInspection(input: {
    readonly workspaceId: string;
    readonly mediaAssetId: string;
    readonly claimedVersion: number;
    readonly status: Extract<MediaInspectionStatus, "READY" | "REJECTED" | "INSPECTION_FAILED">;
    readonly validationErrorCode: MediaInspectionFailureCode | null;
    readonly metadata: {
      readonly durationMs: bigint;
      readonly width: number;
      readonly height: number;
      readonly fps: number;
      readonly bitrateBps: bigint | null;
      readonly codec: string;
      readonly audioCodec: string | null;
      readonly orientation: MediaOrientation;
    } | null;
  }): Promise<{ readonly asset: MediaAssetRecord; readonly updated: boolean }> {
    return this.client.$transaction(async (transaction) => {
      const metadata = input.metadata;
      const status = MediaInspectionStatusSchema.parse(input.status);
      const validationErrorCode =
        input.validationErrorCode === null
          ? null
          : MediaInspectionFailureCodeSchema.parse(input.validationErrorCode);
      const orientation =
        metadata === null ? null : MediaOrientationSchema.parse(metadata.orientation);
      const updated = await transaction.mediaAsset.updateMany({
        where: {
          id: input.mediaAssetId,
          workspaceId: input.workspaceId,
          status: "INSPECTING",
          version: input.claimedVersion,
        },
        data: {
          status,
          validationErrorCode,
          durationMs: metadata?.durationMs ?? null,
          width: metadata?.width ?? null,
          height: metadata?.height ?? null,
          fps: metadata === null ? null : new Prisma.Decimal(metadata.fps.toFixed(3)),
          bitrateBps: metadata?.bitrateBps ?? null,
          codec: metadata?.codec ?? null,
          audioCodec: metadata?.audioCodec ?? null,
          orientation,
          version: { increment: 1 },
        },
      });
      const asset = await transaction.mediaAsset.findUnique({
        where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.mediaAssetId } },
      });
      if (asset === null) throw new Error("Media asset disappeared during inspection");
      return { asset: toRecord(asset), updated: updated.count === 1 };
    });
  }

  async claimThumbnail(input: {
    readonly workspaceId: string;
    readonly mediaAssetId: string;
    readonly staleBefore: Date;
    readonly startedAt: Date;
  }): Promise<
    | { readonly state: "CLAIMED" | "EXISTING"; readonly asset: MediaAssetRecord }
    | { readonly state: "IN_PROGRESS" | "NOT_FOUND" | "NOT_READY" }
  > {
    return this.client.$transaction(async (transaction) => {
      const current = await transaction.mediaAsset.findUnique({
        where: {
          workspaceId_id: { workspaceId: input.workspaceId, id: input.mediaAssetId },
        },
      });
      if (current === null) return { state: "NOT_FOUND" } as const;
      if (current.thumbnailKey !== null) {
        return { state: "EXISTING", asset: toRecord(current) } as const;
      }
      if (current.status !== "READY") return { state: "NOT_READY" } as const;
      if (
        current.thumbnailGenerationStartedAt !== null &&
        current.thumbnailGenerationStartedAt > input.staleBefore
      ) {
        return { state: "IN_PROGRESS" } as const;
      }
      const claimed = await transaction.mediaAsset.updateMany({
        where: {
          id: input.mediaAssetId,
          workspaceId: input.workspaceId,
          status: "READY",
          thumbnailKey: null,
          version: current.version,
          OR: [
            { thumbnailGenerationStartedAt: null },
            { thumbnailGenerationStartedAt: { lte: input.staleBefore } },
          ],
        },
        data: {
          thumbnailGenerationStartedAt: input.startedAt,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        const latest = await transaction.mediaAsset.findUnique({
          where: {
            workspaceId_id: { workspaceId: input.workspaceId, id: input.mediaAssetId },
          },
        });
        if (latest?.thumbnailKey !== null && latest?.thumbnailKey !== undefined) {
          return { state: "EXISTING", asset: toRecord(latest) } as const;
        }
        return { state: "IN_PROGRESS" } as const;
      }
      const asset = await transaction.mediaAsset.findUniqueOrThrow({
        where: {
          workspaceId_id: { workspaceId: input.workspaceId, id: input.mediaAssetId },
        },
      });
      return { state: "CLAIMED", asset: toRecord(asset) } as const;
    });
  }

  async completeThumbnail(input: {
    readonly workspaceId: string;
    readonly mediaAssetId: string;
    readonly claimedVersion: number;
    readonly thumbnailKey: string;
  }): Promise<{ readonly asset: MediaAssetRecord; readonly updated: boolean }> {
    return this.client.$transaction(async (transaction) => {
      const updated = await transaction.mediaAsset.updateMany({
        where: {
          id: input.mediaAssetId,
          workspaceId: input.workspaceId,
          status: "READY",
          thumbnailKey: null,
          thumbnailGenerationStartedAt: { not: null },
          version: input.claimedVersion,
        },
        data: {
          thumbnailKey: input.thumbnailKey,
          thumbnailGenerationStartedAt: null,
          version: { increment: 1 },
        },
      });
      const asset = await transaction.mediaAsset.findUnique({
        where: {
          workspaceId_id: { workspaceId: input.workspaceId, id: input.mediaAssetId },
        },
      });
      if (asset === null) throw new Error("Media asset disappeared during thumbnail generation");
      return { asset: toRecord(asset), updated: updated.count === 1 };
    });
  }

  async releaseThumbnailClaim(input: {
    readonly workspaceId: string;
    readonly mediaAssetId: string;
    readonly claimedVersion: number;
  }): Promise<boolean> {
    const released = await this.client.mediaAsset.updateMany({
      where: {
        id: input.mediaAssetId,
        workspaceId: input.workspaceId,
        thumbnailKey: null,
        thumbnailGenerationStartedAt: { not: null },
        version: input.claimedVersion,
      },
      data: {
        thumbnailGenerationStartedAt: null,
        version: { increment: 1 },
      },
    });
    return released.count === 1;
  }
}
