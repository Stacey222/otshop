import { z } from "zod";

import {
  AuthenticatedContextSchema,
  DATASET_DEFAULT_PAGE_SIZE,
  DATASET_MAX_ITEMS,
  DATASET_MAX_PAGE_SIZE,
  DatasetCreateRequestSchema,
  DatasetIdSchema,
  DatasetItemAddRequestSchema,
  DatasetItemIdSchema,
  DatasetItemUpdateRequestSchema,
  DatasetReorderRequestSchema,
  DatasetUpdateRequestSchema,
  DatasetVersionRequestSchema,
  createUuidV7,
  hasPermission,
  type AuthenticatedContext,
  type Permission,
  type RequestId,
} from "@otshop/shared";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import {
  DatasetArchivedError,
  DatasetConflictError,
  DatasetDuplicateMediaError,
  DatasetItemLimitError,
  DatasetItemNotFoundError,
  DatasetMediaNotReadyError,
  DatasetNotFoundError,
  DatasetPersistenceFailureError,
  InvalidDatasetOrderError,
  InvalidDatasetPaginationError,
} from "./dataset-errors";
import type {
  DatasetItemRecord,
  DatasetMutationState,
  DatasetRecord,
  DatasetRepositoryPort,
} from "./dataset-repository";

const datasetCursorSchema = z.object({ createdAt: z.iso.datetime(), id: DatasetIdSchema }).strict();
const itemCursorSchema = z
  .object({ position: z.number().int().min(0), id: DatasetItemIdSchema })
  .strict();

const encodeCursor = (value: object): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodeCursor = <T>(value: string | undefined, schema: z.ZodType<T>): T | undefined => {
  if (value === undefined) return undefined;
  if (value.length === 0 || value.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new InvalidDatasetPaginationError();
  }
  try {
    return schema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new InvalidDatasetPaginationError();
  }
};

const pageSize = (value: string | undefined): number => {
  if (value === undefined) return DATASET_DEFAULT_PAGE_SIZE;
  if (!/^[1-9][0-9]*$/u.test(value)) throw new InvalidDatasetPaginationError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > DATASET_MAX_PAGE_SIZE) {
    throw new InvalidDatasetPaginationError();
  }
  return parsed;
};

const publicItem = (item: DatasetItemRecord) => ({
  datasetItemId: item.id,
  mediaAssetId: item.mediaAssetId,
  position: item.position,
  captionOverride: item.captionOverride,
  media: {
    status: item.media.status,
    mimeType: item.media.mimeType,
    durationMs: item.media.durationMs?.toString() ?? null,
    width: item.media.width,
    height: item.media.height,
    thumbnailAvailable: item.media.thumbnailAvailable,
  },
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
});

const publicDataset = (dataset: DatasetRecord) => ({
  datasetId: dataset.id,
  name: dataset.name,
  description: dataset.description,
  status: dataset.status,
  version: dataset.version,
  itemCount: dataset.itemCount,
  createdAt: dataset.createdAt.toISOString(),
  updatedAt: dataset.updatedAt.toISOString(),
});

export class DatasetService {
  constructor(
    private readonly repository: DatasetRepositoryPort,
    private readonly log: ApplicationLogger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private authorize(context: AuthenticatedContext, permission: Permission): AuthenticatedContext {
    const canonical = AuthenticatedContextSchema.parse(context);
    if (!hasPermission(canonical.role, permission) || !canonical.permissions.includes(permission)) {
      throw new AuthorizationDeniedError();
    }
    return canonical;
  }

  private mutationFailure(
    state: DatasetMutationState | "ITEM_NOT_FOUND" | "PROJECT_ITEM_CONFLICT",
  ): never {
    if (state === "NOT_FOUND") throw new DatasetNotFoundError();
    if (state === "ARCHIVED") throw new DatasetArchivedError();
    if (state === "ITEM_NOT_FOUND") throw new DatasetItemNotFoundError();
    throw new DatasetConflictError();
  }

  private logMutation(input: {
    readonly requestId: RequestId;
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly datasetItemId?: string;
    readonly operation: string;
    readonly startedAt: number;
  }): void {
    this.log.info("dataset.mutation.completed", {
      requestId: input.requestId,
      workspaceId: input.workspaceId,
      datasetId: input.datasetId,
      ...(input.datasetItemId === undefined ? {} : { datasetItemId: input.datasetItemId }),
      operation: input.operation,
      result: "SUCCESS",
      durationMs: Math.round(performance.now() - input.startedAt),
    });
  }

  async create(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "datasets.write");
    const body = DatasetCreateRequestSchema.parse(input.body);
    const startedAt = performance.now();
    const datasetId = DatasetIdSchema.parse(createUuidV7(this.clock().getTime()));
    let created;
    try {
      created = await this.repository.create({
        id: datasetId,
        workspaceId: context.workspaceId,
        createdByUserId: context.userId,
        name: body.name,
        description: body.description ?? null,
      });
    } catch {
      throw new DatasetPersistenceFailureError();
    }
    if (created.state === "NAME_CONFLICT") throw new DatasetConflictError();
    this.logMutation({
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      datasetId,
      operation: "CREATE",
      startedAt,
    });
    return publicDataset(created.dataset);
  }

  async list(input: {
    readonly context: AuthenticatedContext;
    readonly limit?: string;
    readonly cursor?: string;
    readonly includeArchived?: string;
  }) {
    const context = this.authorize(input.context, "datasets.read");
    if (input.includeArchived !== undefined && !["true", "false"].includes(input.includeArchived)) {
      throw new InvalidDatasetPaginationError();
    }
    const limit = pageSize(input.limit);
    const cursor = decodeCursor(input.cursor, datasetCursorSchema);
    let page;
    try {
      page = await this.repository.list({
        workspaceId: context.workspaceId,
        includeArchived: input.includeArchived === "true",
        limit,
        ...(cursor === undefined
          ? {}
          : { before: { createdAt: new Date(cursor.createdAt), id: cursor.id } }),
      });
    } catch {
      throw new DatasetPersistenceFailureError();
    }
    const last = page.datasets.at(-1);
    return {
      datasets: page.datasets.map(publicDataset),
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  async get(input: {
    readonly context: AuthenticatedContext;
    readonly datasetId: string;
    readonly itemLimit?: string;
    readonly itemCursor?: string;
  }) {
    const context = this.authorize(input.context, "datasets.read");
    const datasetId = DatasetIdSchema.safeParse(input.datasetId);
    if (!datasetId.success) throw new DatasetNotFoundError();
    const limit = pageSize(input.itemLimit);
    const cursor = decodeCursor(input.itemCursor, itemCursorSchema);
    let dataset: DatasetRecord | null;
    let page;
    try {
      [dataset, page] = await Promise.all([
        this.repository.findByWorkspaceAndId(context.workspaceId, datasetId.data),
        this.repository.listItems({
          workspaceId: context.workspaceId,
          datasetId: datasetId.data,
          limit,
          ...(cursor === undefined ? {} : { after: cursor }),
        }),
      ]);
    } catch {
      throw new DatasetPersistenceFailureError();
    }
    if (dataset === null) throw new DatasetNotFoundError();
    const last = page.items.at(-1);
    return {
      ...publicDataset(dataset),
      items: page.items.map(publicItem),
      nextItemCursor:
        page.hasMore && last !== undefined
          ? encodeCursor({ position: last.position, id: last.id })
          : null,
    };
  }

  async update(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly datasetId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "datasets.write");
    const datasetId = DatasetIdSchema.safeParse(input.datasetId);
    if (!datasetId.success) throw new DatasetNotFoundError();
    const body = DatasetUpdateRequestSchema.parse(input.body);
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.updateMetadata({
        workspaceId: context.workspaceId,
        datasetId: datasetId.data,
        expectedVersion: body.expectedVersion,
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(Object.hasOwn(body, "description") ? { description: body.description ?? null } : {}),
      });
    } catch {
      throw new DatasetPersistenceFailureError();
    }
    if (result.state === "NAME_CONFLICT") throw new DatasetConflictError();
    if (result.state !== "UPDATED") this.mutationFailure(result.state);
    this.logMutation({
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      datasetId: datasetId.data,
      operation: "UPDATE",
      startedAt,
    });
    return publicDataset(result.dataset);
  }

  async archive(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly datasetId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "datasets.write");
    const datasetId = DatasetIdSchema.safeParse(input.datasetId);
    if (!datasetId.success) throw new DatasetNotFoundError();
    const body = DatasetVersionRequestSchema.parse(input.body);
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.archive({
        workspaceId: context.workspaceId,
        datasetId: datasetId.data,
        expectedVersion: body.expectedVersion,
      });
    } catch {
      throw new DatasetPersistenceFailureError();
    }
    if (result.state !== "ARCHIVED" || !("dataset" in result)) this.mutationFailure(result.state);
    this.logMutation({
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      datasetId: datasetId.data,
      operation: "ARCHIVE",
      startedAt,
    });
    return publicDataset(result.dataset);
  }

  async addItem(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly datasetId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "datasets.write");
    const datasetId = DatasetIdSchema.safeParse(input.datasetId);
    if (!datasetId.success) throw new DatasetNotFoundError();
    const body = DatasetItemAddRequestSchema.parse(input.body);
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.addItem({
        id: DatasetItemIdSchema.parse(createUuidV7(this.clock().getTime())),
        workspaceId: context.workspaceId,
        datasetId: datasetId.data,
        mediaAssetId: body.mediaAssetId,
        captionOverride: body.captionOverride ?? null,
        expectedVersion: body.expectedVersion,
        maximumItems: DATASET_MAX_ITEMS,
      });
    } catch {
      throw new DatasetPersistenceFailureError();
    }
    if (result.state === "DUPLICATE_MEDIA") throw new DatasetDuplicateMediaError();
    if (result.state === "MEDIA_NOT_READY") throw new DatasetMediaNotReadyError();
    if (result.state === "ITEM_LIMIT") throw new DatasetItemLimitError();
    if (result.state !== "ADDED") this.mutationFailure(result.state);
    this.logMutation({
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      datasetId: datasetId.data,
      datasetItemId: result.item.id,
      operation: "ADD_ITEM",
      startedAt,
    });
    return { dataset: publicDataset(result.dataset), item: publicItem(result.item) };
  }

  async updateItem(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly datasetId: string;
    readonly itemId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "datasets.write");
    const datasetId = DatasetIdSchema.safeParse(input.datasetId);
    const itemId = DatasetItemIdSchema.safeParse(input.itemId);
    if (!datasetId.success) throw new DatasetNotFoundError();
    if (!itemId.success) throw new DatasetItemNotFoundError();
    const body = DatasetItemUpdateRequestSchema.parse(input.body);
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.updateItem({
        workspaceId: context.workspaceId,
        datasetId: datasetId.data,
        itemId: itemId.data,
        captionOverride: body.captionOverride,
        expectedVersion: body.expectedVersion,
      });
    } catch {
      throw new DatasetPersistenceFailureError();
    }
    if (result.state !== "UPDATED") this.mutationFailure(result.state);
    this.logMutation({
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      datasetId: datasetId.data,
      datasetItemId: itemId.data,
      operation: "UPDATE_ITEM",
      startedAt,
    });
    return { dataset: publicDataset(result.dataset), item: publicItem(result.item) };
  }

  async removeItem(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly datasetId: string;
    readonly itemId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "datasets.write");
    const datasetId = DatasetIdSchema.safeParse(input.datasetId);
    const itemId = DatasetItemIdSchema.safeParse(input.itemId);
    if (!datasetId.success) throw new DatasetNotFoundError();
    if (!itemId.success) throw new DatasetItemNotFoundError();
    const body = DatasetVersionRequestSchema.parse(input.body);
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.removeItem({
        workspaceId: context.workspaceId,
        datasetId: datasetId.data,
        itemId: itemId.data,
        expectedVersion: body.expectedVersion,
      });
    } catch {
      throw new DatasetPersistenceFailureError();
    }
    if (result.state !== "REMOVED") this.mutationFailure(result.state);
    this.logMutation({
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      datasetId: datasetId.data,
      datasetItemId: itemId.data,
      operation: "REMOVE_ITEM",
      startedAt,
    });
    return publicDataset(result.dataset);
  }

  async reorder(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly datasetId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "datasets.write");
    const datasetId = DatasetIdSchema.safeParse(input.datasetId);
    if (!datasetId.success) throw new DatasetNotFoundError();
    const body = DatasetReorderRequestSchema.parse(input.body);
    if (new Set(body.itemIds).size !== body.itemIds.length) throw new InvalidDatasetOrderError();
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.reorder({
        workspaceId: context.workspaceId,
        datasetId: datasetId.data,
        itemIds: body.itemIds,
        expectedVersion: body.expectedVersion,
      });
    } catch {
      throw new DatasetPersistenceFailureError();
    }
    if (result.state === "INVALID_ORDER") throw new InvalidDatasetOrderError();
    if (result.state !== "REORDERED") this.mutationFailure(result.state);
    this.logMutation({
      requestId: input.requestId,
      workspaceId: context.workspaceId,
      datasetId: datasetId.data,
      operation: "REORDER",
      startedAt,
    });
    return { dataset: publicDataset(result.dataset), items: result.items.map(publicItem) };
  }
}
