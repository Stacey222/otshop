import {
  Prisma,
  PrismaClient,
  type MediaImportBatch,
  type MediaImportBatchItem,
} from "@prisma/client";
import { MediaImportBatchItemOutcomeSchema, MediaImportBatchStatusSchema } from "@otshop/shared";

import { getDatabaseClient } from "./client";

const toBatch = (batch: MediaImportBatch) => ({
  id: batch.id,
  workspaceId: batch.workspaceId,
  datasetId: batch.datasetId,
  createdByUserId: batch.createdByUserId,
  name: batch.name,
  status: MediaImportBatchStatusSchema.parse(batch.status),
  totalBytes: batch.totalBytes,
  reservedBytes: batch.reservedBytes,
  activeUploads: batch.activeUploads,
  version: batch.version,
  createdAt: batch.createdAt,
  updatedAt: batch.updatedAt,
});

const toItem = (item: MediaImportBatchItem) => ({
  id: item.id,
  workspaceId: item.workspaceId,
  batchId: item.batchId,
  mediaAssetId: item.mediaAssetId,
  inputIndex: item.inputIndex,
  displayFilename: item.displayFilename,
  outcome: MediaImportBatchItemOutcomeSchema.parse(item.outcome),
  declaredBytes: item.declaredBytes,
  sizeBytes: item.sizeBytes,
  errorCode: item.errorCode,
  datasetPosition: item.datasetPosition,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const isConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (error.code === "P2002" || error.code === "P2034");

export class MediaImportBatchRepository {
  constructor(private readonly client: PrismaClient = getDatabaseClient()) {}

  async create(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly createdByUserId: string;
    readonly name: string;
    readonly datasetId: string;
  }) {
    return toBatch(
      await this.client.mediaImportBatch.create({
        data: { ...input, status: "CREATED" },
      }),
    );
  }

  async findByWorkspaceAndId(workspaceId: string, batchId: string) {
    const batch = await this.client.mediaImportBatch.findUnique({
      where: { workspaceId_id: { workspaceId, id: batchId } },
    });
    return batch === null ? null : toBatch(batch);
  }

  async listItems(input: {
    readonly workspaceId: string;
    readonly batchId: string;
    readonly limit: number;
    readonly afterInputIndex?: number;
  }) {
    const items = await this.client.mediaImportBatchItem.findMany({
      where: {
        workspaceId: input.workspaceId,
        batchId: input.batchId,
        ...(input.afterInputIndex === undefined
          ? {}
          : { inputIndex: { gt: input.afterInputIndex } }),
      },
      orderBy: [{ inputIndex: "asc" }, { id: "asc" }],
      take: input.limit + 1,
    });
    return {
      items: items.slice(0, input.limit).map(toItem),
      hasMore: items.length > input.limit,
    };
  }

  async startItem(input: {
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
  }) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const batch = await tx.mediaImportBatch.findUnique({
            where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.batchId } },
          });
          if (batch === null) return { state: "NOT_FOUND" } as const;
          if (
            ["COMPLETED", "COMPLETED_WITH_ERRORS", "FINALIZING", "FAILED"].includes(batch.status)
          ) {
            return { state: "FINAL" } as const;
          }
          if (batch.version !== input.expectedVersion) return { state: "CONFLICT" } as const;
          const itemCount = await tx.mediaImportBatchItem.count({
            where: { workspaceId: input.workspaceId, batchId: input.batchId },
          });
          if (itemCount >= input.maximumFiles) return { state: "FILE_LIMIT" } as const;
          if (batch.activeUploads >= input.maximumConcurrency) {
            return { state: "ACTIVE_UPLOADS" } as const;
          }
          if (
            batch.totalBytes + batch.reservedBytes + BigInt(input.declaredBytes) >
            BigInt(input.maximumTotalBytes)
          ) {
            return { state: "TOTAL_LIMIT" } as const;
          }
          const claimed = await tx.mediaImportBatch.updateMany({
            where: {
              id: input.batchId,
              workspaceId: input.workspaceId,
              version: input.expectedVersion,
              status: { in: ["CREATED", "PROCESSING"] },
            },
            data: {
              status: "PROCESSING",
              activeUploads: { increment: 1 },
              reservedBytes: { increment: BigInt(input.declaredBytes) },
              version: { increment: 1 },
            },
          });
          if (claimed.count !== 1) return { state: "CONFLICT" } as const;
          const item = await tx.mediaImportBatchItem.create({
            data: {
              id: input.id,
              workspaceId: input.workspaceId,
              batchId: input.batchId,
              inputIndex: input.inputIndex,
              displayFilename: input.displayFilename,
              declaredBytes: BigInt(input.declaredBytes),
              outcome: "UPLOADING",
            },
          });
          const updated = await tx.mediaImportBatch.findUniqueOrThrow({
            where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.batchId } },
          });
          return { state: "STARTED", batch: toBatch(updated), item: toItem(item) } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isConflict(error)) return { state: "ITEM_CONFLICT" } as const;
      throw error;
    }
  }

  async finishItem(input: {
    readonly workspaceId: string;
    readonly batchId: string;
    readonly itemId: string;
    readonly actualBytes: number;
    readonly outcome: "SUCCESS" | "REUSED" | "REJECTED" | "FAILED";
    readonly mediaAssetId: string | null;
    readonly errorCode: string | null;
  }) {
    return this.client.$transaction(async (tx) => {
      const item = await tx.mediaImportBatchItem.findUnique({
        where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.itemId } },
      });
      if (item === null || item.batchId !== input.batchId || item.outcome !== "UPLOADING") {
        return false;
      }
      const updated = await tx.mediaImportBatchItem.updateMany({
        where: {
          id: input.itemId,
          workspaceId: input.workspaceId,
          batchId: input.batchId,
          outcome: "UPLOADING",
        },
        data: {
          outcome: input.outcome,
          sizeBytes: BigInt(input.actualBytes),
          mediaAssetId: input.mediaAssetId,
          errorCode: input.errorCode,
        },
      });
      if (updated.count !== 1) return false;
      await tx.mediaImportBatch.update({
        where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.batchId } },
        data: {
          activeUploads: { decrement: 1 },
          reservedBytes: { decrement: item.declaredBytes },
          totalBytes: { increment: BigInt(input.actualBytes) },
          version: { increment: 1 },
        },
      });
      return true;
    });
  }

  async claimFinalization(input: {
    readonly workspaceId: string;
    readonly batchId: string;
    readonly expectedVersion: number;
  }) {
    return this.client.$transaction(async (tx) => {
      const batch = await tx.mediaImportBatch.findUnique({
        where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.batchId } },
      });
      if (batch === null) return { state: "NOT_FOUND" } as const;
      if (["COMPLETED", "COMPLETED_WITH_ERRORS"].includes(batch.status)) {
        return { state: "FINAL", batch: toBatch(batch) } as const;
      }
      if (batch.version !== input.expectedVersion) return { state: "CONFLICT" } as const;
      if (batch.activeUploads !== 0) return { state: "ACTIVE_UPLOADS" } as const;
      const [total, uploading] = await Promise.all([
        tx.mediaImportBatchItem.count({
          where: { workspaceId: input.workspaceId, batchId: input.batchId },
        }),
        tx.mediaImportBatchItem.count({
          where: { workspaceId: input.workspaceId, batchId: input.batchId, outcome: "UPLOADING" },
        }),
      ]);
      if (total === 0 || uploading !== 0 || batch.datasetId === null) {
        return { state: "NOT_FINALIZABLE" } as const;
      }
      const claimed = await tx.mediaImportBatch.updateMany({
        where: {
          id: input.batchId,
          workspaceId: input.workspaceId,
          version: input.expectedVersion,
          status: { in: ["CREATED", "PROCESSING", "FAILED"] },
          activeUploads: 0,
        },
        data: { status: "FINALIZING", version: { increment: 1 } },
      });
      if (claimed.count !== 1) return { state: "CONFLICT" } as const;
      return {
        state: "CLAIMED",
        batch: toBatch(
          await tx.mediaImportBatch.findUniqueOrThrow({
            where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.batchId } },
          }),
        ),
      } as const;
    });
  }

  async markDatasetPosition(input: {
    readonly workspaceId: string;
    readonly batchId: string;
    readonly itemId: string;
    readonly datasetPosition: number;
  }) {
    const updated = await this.client.mediaImportBatchItem.updateMany({
      where: {
        id: input.itemId,
        workspaceId: input.workspaceId,
        batchId: input.batchId,
        datasetPosition: null,
      },
      data: { datasetPosition: input.datasetPosition },
    });
    return updated.count === 1;
  }

  async completeFinalization(input: {
    readonly workspaceId: string;
    readonly batchId: string;
    readonly status: "COMPLETED" | "COMPLETED_WITH_ERRORS";
  }) {
    const updated = await this.client.mediaImportBatch.updateMany({
      where: {
        id: input.batchId,
        workspaceId: input.workspaceId,
        status: "FINALIZING",
      },
      data: { status: input.status, version: { increment: 1 } },
    });
    return updated.count === 1 ? this.findByWorkspaceAndId(input.workspaceId, input.batchId) : null;
  }

  async failFinalization(workspaceId: string, batchId: string) {
    await this.client.mediaImportBatch.updateMany({
      where: { id: batchId, workspaceId, status: "FINALIZING" },
      data: { status: "FAILED", version: { increment: 1 } },
    });
  }
}
