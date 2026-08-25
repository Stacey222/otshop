import type {
  MediaInspectionFailureCode,
  MediaInspectionStatus,
  MediaOrientation,
} from "@otshop/shared";

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

export interface CreateMediaAssetResult {
  readonly asset: MediaAssetRecord;
  readonly created: boolean;
}

export interface MediaAssetRepositoryPort {
  findByWorkspaceAndSha256(
    workspaceId: string,
    sha256: Uint8Array,
  ): Promise<MediaAssetRecord | null>;
  createOrFind(input: CreateMediaAssetInput): Promise<CreateMediaAssetResult>;
}

export interface MediaInspectionRepositoryPort {
  findByWorkspaceAndId(workspaceId: string, mediaAssetId: string): Promise<MediaAssetRecord | null>;
  claimInspection(
    workspaceId: string,
    mediaAssetId: string,
    staleBefore: Date,
  ): Promise<
    | { readonly state: "CLAIMED" | "FINAL"; readonly asset: MediaAssetRecord }
    | { readonly state: "BLOCKED" | "IN_PROGRESS" | "NOT_FOUND" }
  >;
  completeInspection(input: {
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
  }): Promise<{ readonly asset: MediaAssetRecord; readonly updated: boolean }>;
}
