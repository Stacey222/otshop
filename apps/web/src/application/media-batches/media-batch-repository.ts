import type { MediaImportBatchItemOutcome, MediaImportBatchStatus } from "@otshop/shared";

export interface MediaImportBatchRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly datasetId: string | null;
  readonly createdByUserId: string;
  readonly name: string;
  readonly status: MediaImportBatchStatus;
  readonly totalBytes: bigint;
  readonly reservedBytes: bigint;
  readonly activeUploads: number;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MediaImportBatchItemRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly batchId: string;
  readonly mediaAssetId: string | null;
  readonly inputIndex: number;
  readonly displayFilename: string;
  readonly outcome: MediaImportBatchItemOutcome;
  readonly declaredBytes: bigint;
  readonly sizeBytes: bigint | null;
  readonly errorCode: string | null;
  readonly datasetPosition: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MediaImportBatchPage {
  readonly items: readonly MediaImportBatchItemRecord[];
  readonly hasMore: boolean;
}

export type BatchMutationFailure =
  | "ACTIVE_UPLOADS"
  | "CONFLICT"
  | "FILE_LIMIT"
  | "FINAL"
  | "ITEM_CONFLICT"
  | "NOT_FOUND"
  | "NOT_FINALIZABLE"
  | "TOTAL_LIMIT";

export interface MediaImportBatchRepositoryPort {
  create(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly createdByUserId: string;
    readonly name: string;
    readonly datasetId: string;
  }): Promise<MediaImportBatchRecord>;
  findByWorkspaceAndId(
    workspaceId: string,
    batchId: string,
  ): Promise<MediaImportBatchRecord | null>;
  listItems(input: {
    readonly workspaceId: string;
    readonly batchId: string;
    readonly limit: number;
    readonly afterInputIndex?: number;
  }): Promise<MediaImportBatchPage>;
  startItem(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly batchId: string;
    readonly inputIndex: number;
    readonly displayFilename: string;
    readonly declaredBytes: number;
    readonly expectedVersion: number;
    readonly maximumFiles: number;
    readonly maximumTotalBytes: number;
    readonly maximumConcurrency: number;
  }): Promise<
    | {
        readonly state: "STARTED";
        readonly batch: MediaImportBatchRecord;
        readonly item: MediaImportBatchItemRecord;
      }
    | { readonly state: BatchMutationFailure }
  >;
  finishItem(input: {
    readonly workspaceId: string;
    readonly batchId: string;
    readonly itemId: string;
    readonly actualBytes: number;
    readonly outcome: Exclude<MediaImportBatchItemOutcome, "UPLOADING">;
    readonly mediaAssetId: string | null;
    readonly errorCode: string | null;
  }): Promise<boolean>;
  claimFinalization(input: {
    readonly workspaceId: string;
    readonly batchId: string;
    readonly expectedVersion: number;
  }): Promise<
    | { readonly state: "CLAIMED" | "FINAL"; readonly batch: MediaImportBatchRecord }
    | { readonly state: BatchMutationFailure }
  >;
  markDatasetPosition(input: {
    readonly workspaceId: string;
    readonly batchId: string;
    readonly itemId: string;
    readonly datasetPosition: number;
  }): Promise<boolean>;
  completeFinalization(input: {
    readonly workspaceId: string;
    readonly batchId: string;
    readonly status: Extract<MediaImportBatchStatus, "COMPLETED" | "COMPLETED_WITH_ERRORS">;
  }): Promise<MediaImportBatchRecord | null>;
  failFinalization(workspaceId: string, batchId: string): Promise<void>;
}
