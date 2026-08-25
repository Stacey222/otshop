import {
  AuthenticatedContextSchema,
  MEDIA_BATCH_DEFAULT_RESULT_PAGE_SIZE,
  MEDIA_BATCH_MAX_FILES,
  MEDIA_BATCH_MAX_RESULT_PAGE_SIZE,
  MediaImportBatchCreateRequestSchema,
  MediaImportBatchIdSchema,
  MediaImportBatchInputIndexSchema,
  MediaImportBatchItemIdSchema,
  MediaImportBatchVersionRequestSchema,
  createUuidV7,
  hasPermission,
  type AuthenticatedContext,
  type RequestId,
} from "@otshop/shared";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import { DatasetConflictError } from "@/application/datasets/dataset-errors";
import type { DatasetService } from "@/application/datasets/dataset-service";
import type { ApplicationError } from "@/application/errors/application-error";
import type { MediaIngestService } from "@/application/media/media-ingest-service";
import type { MediaInspectionService } from "@/application/media/media-inspection-service";
import { sanitizeOriginalFilename } from "@/application/media/media-validation";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import {
  InvalidMediaBatchPaginationError,
  MediaBatchConflictError,
  MediaBatchItemConflictError,
  MediaBatchLimitError,
  MediaBatchNotFinalizableError,
  MediaBatchNotFoundError,
  MediaBatchPersistenceFailureError,
} from "./media-batch-errors";
import type {
  BatchMutationFailure,
  MediaImportBatchItemRecord,
  MediaImportBatchRecord,
  MediaImportBatchRepositoryPort,
} from "./media-batch-repository";

const permanentItemCodes = new Set([
  "INVALID_MEDIA",
  "INVALID_MEDIA_FILENAME",
  "MEDIA_BATCH_LIMIT",
  "MEDIA_TOO_LARGE",
  "MEDIA_UNSUPPORTED",
  "UNSUPPORTED_MEDIA_TYPE",
]);

const errorCode = (error: unknown): string =>
  typeof error === "object" && error !== null && typeof Reflect.get(error, "code") === "string"
    ? (Reflect.get(error, "code") as string)
    : "MEDIA_BATCH_ITEM_FAILED";

const pageSize = (value: string | undefined): number => {
  if (value === undefined) return MEDIA_BATCH_DEFAULT_RESULT_PAGE_SIZE;
  if (!/^[1-9][0-9]*$/u.test(value)) throw new InvalidMediaBatchPaginationError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MEDIA_BATCH_MAX_RESULT_PAGE_SIZE) {
    throw new InvalidMediaBatchPaginationError();
  }
  return parsed;
};

const cursor = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  if (!/^[0-9]+$/u.test(value)) throw new InvalidMediaBatchPaginationError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed >= MEDIA_BATCH_MAX_FILES) {
    throw new InvalidMediaBatchPaginationError();
  }
  return parsed;
};

const publicItem = (item: MediaImportBatchItemRecord) => ({
  batchItemId: item.id,
  inputIndex: item.inputIndex,
  displayFilename: item.displayFilename,
  outcome: item.outcome,
  mediaAssetId: item.mediaAssetId,
  sizeBytes: item.sizeBytes?.toString() ?? null,
  errorCode: item.errorCode,
  datasetPosition: item.datasetPosition,
});

const summary = (items: readonly MediaImportBatchItemRecord[]) => ({
  total: items.length,
  ready: items.filter(({ outcome }) => outcome === "SUCCESS" || outcome === "REUSED").length,
  reused: items.filter(({ outcome }) => outcome === "REUSED").length,
  rejected: items.filter(({ outcome }) => outcome === "REJECTED").length,
  failed: items.filter(({ outcome }) => outcome === "FAILED").length,
  uploading: items.filter(({ outcome }) => outcome === "UPLOADING").length,
});

export class MediaImportBatchService {
  constructor(
    private readonly repository: MediaImportBatchRepositoryPort,
    private readonly ingestService: MediaIngestService,
    private readonly inspectionService: MediaInspectionService,
    private readonly datasetService: DatasetService,
    private readonly limits: {
      readonly maximumFiles: number;
      readonly maximumTotalBytes: number;
      readonly maximumConcurrency: number;
      readonly maximumIndividualBytes: number;
    },
    private readonly log: ApplicationLogger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private authorize(context: AuthenticatedContext): AuthenticatedContext {
    const canonical = AuthenticatedContextSchema.parse(context);
    for (const permission of ["media.upload", "datasets.read", "datasets.write"] as const) {
      if (
        !hasPermission(canonical.role, permission) ||
        !canonical.permissions.includes(permission)
      ) {
        throw new AuthorizationDeniedError();
      }
    }
    return canonical;
  }

  private mutationFailure(state: BatchMutationFailure): never {
    if (state === "NOT_FOUND") throw new MediaBatchNotFoundError();
    if (state === "FILE_LIMIT" || state === "TOTAL_LIMIT" || state === "ACTIVE_UPLOADS") {
      throw new MediaBatchLimitError();
    }
    if (state === "ITEM_CONFLICT") throw new MediaBatchItemConflictError();
    if (state === "NOT_FINALIZABLE" || state === "FINAL") {
      throw new MediaBatchNotFinalizableError();
    }
    throw new MediaBatchConflictError();
  }

  private async allItems(context: AuthenticatedContext, batchId: string) {
    try {
      return (
        await this.repository.listItems({
          workspaceId: context.workspaceId,
          batchId,
          limit: MEDIA_BATCH_MAX_FILES,
        })
      ).items;
    } catch {
      throw new MediaBatchPersistenceFailureError();
    }
  }

  private async response(
    context: AuthenticatedContext,
    batch: MediaImportBatchRecord,
    input?: { readonly limit?: string; readonly cursor?: string },
  ) {
    const limit = pageSize(input?.limit);
    const after = cursor(input?.cursor);
    const items = await this.allItems(context, batch.id);
    const remaining = items.filter((item) => after === undefined || item.inputIndex > after);
    const page = remaining.slice(0, limit);
    const hasMore = remaining.length > limit;
    return {
      batchId: batch.id,
      datasetId: batch.datasetId,
      name: batch.name,
      status: batch.status,
      version: batch.version,
      totalBytes: batch.totalBytes.toString(),
      limits: {
        maximumFiles: this.limits.maximumFiles,
        maximumTotalBytes: this.limits.maximumTotalBytes,
        maximumConcurrency: this.limits.maximumConcurrency,
        maximumIndividualBytes: this.limits.maximumIndividualBytes,
      },
      summary: summary(items),
      items: page.map(publicItem),
      nextCursor: hasMore ? String(page.at(-1)!.inputIndex) : null,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    };
  }

  async create(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context);
    const body = MediaImportBatchCreateRequestSchema.parse(input.body);
    const batchId = MediaImportBatchIdSchema.parse(createUuidV7(this.clock().getTime()));
    let dataset;
    try {
      dataset = await this.datasetService.create({
        context,
        requestId: input.requestId,
        body: { name: body.name },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        Reflect.get(error, "code") === "DATASET_CONFLICT"
      ) {
        throw new MediaBatchConflictError();
      }
      throw new MediaBatchPersistenceFailureError();
    }
    let batch;
    try {
      batch = await this.repository.create({
        id: batchId,
        workspaceId: context.workspaceId,
        createdByUserId: context.userId,
        name: body.name,
        datasetId: dataset.datasetId,
      });
    } catch {
      throw new MediaBatchPersistenceFailureError();
    }
    this.log.info("media.batch.created", {
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      batchId,
      operation: "CREATE",
      outcome: "CREATED",
    });
    return this.response(context, batch);
  }

  async get(input: {
    readonly context: AuthenticatedContext;
    readonly batchId: string;
    readonly limit?: string;
    readonly cursor?: string;
  }) {
    const context = this.authorize(input.context);
    pageSize(input.limit);
    cursor(input.cursor);
    const batchId = MediaImportBatchIdSchema.safeParse(input.batchId);
    if (!batchId.success) throw new MediaBatchNotFoundError();
    let batch;
    try {
      batch = await this.repository.findByWorkspaceAndId(context.workspaceId, batchId.data);
    } catch {
      throw new MediaBatchPersistenceFailureError();
    }
    if (batch === null) throw new MediaBatchNotFoundError();
    return this.response(context, batch, {
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    });
  }

  async uploadItem(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly batchId: string;
    readonly expectedVersion: number;
    readonly inputIndex: number;
    readonly originalFilename: string;
    readonly declaredMimeType: string;
    readonly declaredBytes: number;
    readonly source: AsyncIterable<Uint8Array>;
  }) {
    const context = this.authorize(input.context);
    const batchId = MediaImportBatchIdSchema.safeParse(input.batchId);
    if (!batchId.success) throw new MediaBatchNotFoundError();
    const inputIndex = MediaImportBatchInputIndexSchema.parse(input.inputIndex);
    const filename = sanitizeOriginalFilename(input.originalFilename);
    if (
      !Number.isSafeInteger(input.declaredBytes) ||
      input.declaredBytes <= 0 ||
      input.declaredBytes > this.limits.maximumIndividualBytes
    ) {
      throw new MediaBatchLimitError();
    }
    const itemId = MediaImportBatchItemIdSchema.parse(createUuidV7(this.clock().getTime()));
    let started;
    try {
      started = await this.repository.startItem({
        id: itemId,
        workspaceId: context.workspaceId,
        batchId: batchId.data,
        inputIndex,
        displayFilename: filename,
        declaredBytes: input.declaredBytes,
        expectedVersion: input.expectedVersion,
        maximumFiles: this.limits.maximumFiles,
        maximumTotalBytes: this.limits.maximumTotalBytes,
        maximumConcurrency: this.limits.maximumConcurrency,
      });
    } catch {
      throw new MediaBatchPersistenceFailureError();
    }
    if (started.state !== "STARTED") this.mutationFailure(started.state);

    let observed = 0;
    const counted: AsyncIterable<Uint8Array> = {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of input.source) {
          observed += chunk.byteLength;
          if (observed > input.declaredBytes) throw new MediaBatchLimitError();
          yield chunk;
        }
      },
    };
    let outcome: "SUCCESS" | "REUSED" | "REJECTED" | "FAILED" = "FAILED";
    let mediaAssetId: string | null = null;
    let itemErrorCode: string | null = null;
    try {
      const ingested = await this.ingestService.ingest({
        context,
        requestId: input.requestId,
        originalFilename: filename,
        declaredMimeType: input.declaredMimeType,
        source: counted,
      });
      mediaAssetId = ingested.mediaAssetId;
      await this.inspectionService.inspect({
        context,
        requestId: input.requestId,
        mediaAssetId,
      });
      outcome = ingested.duplicate ? "REUSED" : "SUCCESS";
    } catch (error) {
      itemErrorCode = errorCode(error);
      outcome = permanentItemCodes.has(itemErrorCode) ? "REJECTED" : "FAILED";
    }
    try {
      const finished = await this.repository.finishItem({
        workspaceId: context.workspaceId,
        batchId: batchId.data,
        itemId,
        actualBytes: observed,
        outcome,
        mediaAssetId,
        errorCode: itemErrorCode,
      });
      if (!finished) throw new MediaBatchPersistenceFailureError();
    } catch (error) {
      if (error instanceof MediaBatchPersistenceFailureError) throw error;
      throw new MediaBatchPersistenceFailureError();
    }
    let batch;
    try {
      batch = await this.repository.findByWorkspaceAndId(context.workspaceId, batchId.data);
    } catch {
      throw new MediaBatchPersistenceFailureError();
    }
    if (batch === null) throw new MediaBatchPersistenceFailureError();
    this.log.info("media.batch.item.completed", {
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      batchId: batchId.data,
      batchItemId: itemId,
      ...(mediaAssetId === null ? {} : { mediaAssetId }),
      inputIndex,
      operation: "UPLOAD_AND_INSPECT",
      outcome,
      byteCount: observed,
    });
    return this.response(context, batch);
  }

  async finalize(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly batchId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context);
    const batchId = MediaImportBatchIdSchema.safeParse(input.batchId);
    if (!batchId.success) throw new MediaBatchNotFoundError();
    const body = MediaImportBatchVersionRequestSchema.parse(input.body);
    let claim;
    try {
      claim = await this.repository.claimFinalization({
        workspaceId: context.workspaceId,
        batchId: batchId.data,
        expectedVersion: body.expectedVersion,
      });
    } catch {
      throw new MediaBatchPersistenceFailureError();
    }
    if (!("batch" in claim)) this.mutationFailure(claim.state);
    if (claim.state === "FINAL") return this.response(context, claim.batch);
    if (claim.state !== "CLAIMED") throw new MediaBatchConflictError();
    const datasetId = claim.batch.datasetId;
    if (datasetId === null) throw new MediaBatchNotFinalizableError();

    try {
      const items = await this.allItems(context, batchId.data);
      const eligible = items.filter(
        (item) =>
          (item.outcome === "SUCCESS" || item.outcome === "REUSED") && item.mediaAssetId !== null,
      );
      let dataset = await this.datasetService.get({
        context,
        datasetId,
        itemLimit: String(MEDIA_BATCH_MAX_FILES),
      });
      const orderedUniqueMedia = [
        ...new Set(eligible.map(({ mediaAssetId }) => mediaAssetId as string)),
      ];
      if (
        dataset.items.some(({ mediaAssetId }) => !orderedUniqueMedia.includes(mediaAssetId)) ||
        dataset.items.some(({ mediaAssetId }, index) => orderedUniqueMedia[index] !== mediaAssetId)
      ) {
        throw new DatasetConflictError();
      }
      const positions = new Map(
        dataset.items.map(({ mediaAssetId, position }) => [mediaAssetId, position]),
      );
      for (const item of eligible) {
        const mediaAssetId = item.mediaAssetId as string;
        let position = positions.get(mediaAssetId);
        if (position === undefined) {
          const added = await this.datasetService.addItem({
            context,
            requestId: input.requestId,
            datasetId,
            body: { expectedVersion: dataset.version, mediaAssetId },
          });
          dataset = {
            ...dataset,
            version: added.dataset.version,
            itemCount: added.dataset.itemCount,
          };
          position = added.item.position;
          positions.set(mediaAssetId, position);
        }
        if (item.datasetPosition === null) {
          await this.repository.markDatasetPosition({
            workspaceId: context.workspaceId,
            batchId: batchId.data,
            itemId: item.id,
            datasetPosition: position,
          });
        }
      }
      const finalStatus = items.some(
        ({ outcome }) => outcome === "REJECTED" || outcome === "FAILED",
      )
        ? "COMPLETED_WITH_ERRORS"
        : "COMPLETED";
      const completed = await this.repository.completeFinalization({
        workspaceId: context.workspaceId,
        batchId: batchId.data,
        status: finalStatus,
      });
      if (completed === null) throw new MediaBatchPersistenceFailureError();
      this.log.info("media.batch.finalized", {
        requestId: input.requestId,
        workspaceId: context.workspaceId,
        batchId: batchId.data,
        operation: "FINALIZE",
        outcome: finalStatus,
      });
      return this.response(context, completed);
    } catch (error) {
      await this.repository
        .failFinalization(context.workspaceId, batchId.data)
        .catch(() => undefined);
      if (
        typeof error === "object" &&
        error !== null &&
        Reflect.get(error, "code") === "DATASET_CONFLICT"
      ) {
        throw new MediaBatchConflictError();
      }
      if ((error as ApplicationError)?.code?.startsWith("MEDIA_BATCH_")) throw error;
      throw new MediaBatchPersistenceFailureError();
    }
  }
}
