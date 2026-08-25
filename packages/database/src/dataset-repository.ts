import {
  Prisma,
  PrismaClient,
  type Dataset,
  type DatasetItem,
  type MediaAsset,
  type Prisma as PrismaNamespace,
} from "@prisma/client";
import { DatasetStatusSchema } from "@otshop/shared";

import { getDatabaseClient } from "./client";

type Transaction = PrismaNamespace.TransactionClient;
type DatasetWithCount = Dataset & { readonly _count: { readonly items: number } };
type DatasetItemWithMedia = DatasetItem & {
  readonly mediaAsset: Pick<
    MediaAsset,
    "status" | "mimeType" | "durationMs" | "width" | "height" | "thumbnailKey"
  >;
};

export interface DatasetRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: "ACTIVE" | "ARCHIVED";
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly itemCount: number;
}

export interface DatasetItemRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly datasetId: string;
  readonly mediaAssetId: string;
  readonly position: number;
  readonly captionOverride: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly media: {
    readonly status: string;
    readonly mimeType: string;
    readonly durationMs: bigint | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly thumbnailAvailable: boolean;
  };
}

const datasetInclude = { _count: { select: { items: true } } } as const;
const itemInclude = {
  mediaAsset: {
    select: {
      status: true,
      mimeType: true,
      durationMs: true,
      width: true,
      height: true,
      thumbnailKey: true,
    },
  },
} as const;

const toDataset = (dataset: DatasetWithCount): DatasetRecord => ({
  id: dataset.id,
  workspaceId: dataset.workspaceId,
  name: dataset.name,
  description: dataset.description,
  status: DatasetStatusSchema.parse(dataset.status),
  createdByUserId: dataset.createdByUserId,
  createdAt: dataset.createdAt,
  updatedAt: dataset.updatedAt,
  version: dataset.version,
  itemCount: dataset._count.items,
});

const toItem = (item: DatasetItemWithMedia): DatasetItemRecord => ({
  id: item.id,
  workspaceId: item.workspaceId,
  datasetId: item.datasetId,
  mediaAssetId: item.mediaAssetId,
  position: item.position,
  captionOverride: item.captionOverride,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  media: {
    status: item.mediaAsset.status,
    mimeType: item.mediaAsset.mimeType,
    durationMs: item.mediaAsset.durationMs,
    width: item.mediaAsset.width,
    height: item.mediaAsset.height,
    thumbnailAvailable: item.mediaAsset.thumbnailKey !== null,
  },
});

const isUniqueConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const findDataset = (tx: Transaction, workspaceId: string, datasetId: string) =>
  tx.dataset.findUnique({
    where: { workspaceId_id: { workspaceId, id: datasetId } },
    include: datasetInclude,
  });

const mutationState = (
  dataset: DatasetWithCount | null,
  expectedVersion: number,
): "ARCHIVED" | "CONFLICT" | "NOT_FOUND" | null => {
  if (dataset === null) return "NOT_FOUND";
  if (DatasetStatusSchema.parse(dataset.status) === "ARCHIVED") return "ARCHIVED";
  return dataset.version === expectedVersion ? null : "CONFLICT";
};

const claimMutation = async (
  tx: Transaction,
  workspaceId: string,
  datasetId: string,
  expectedVersion: number,
): Promise<boolean> => {
  const updated = await tx.dataset.updateMany({
    where: { id: datasetId, workspaceId, status: "ACTIVE", version: expectedVersion },
    data: { version: { increment: 1 } },
  });
  return updated.count === 1;
};

const normalizePositions = async (
  tx: Transaction,
  workspaceId: string,
  datasetId: string,
  orderedIds: readonly string[],
): Promise<void> => {
  if (orderedIds.length === 0) return;
  await tx.$executeRaw`SET CONSTRAINTS "dataset_items_dataset_position_key" DEFERRED`;
  const assignments = orderedIds.map(
    (id, position) => Prisma.sql`(${id}::uuid, ${position}::integer)`,
  );
  const updated = await tx.$executeRaw(Prisma.sql`
    UPDATE "dataset_items" AS item
    SET "position" = ordering."position"
    FROM (VALUES ${Prisma.join(assignments)}) AS ordering("id", "position")
    WHERE item."id" = ordering."id"
      AND item."workspace_id" = ${workspaceId}::uuid
      AND item."dataset_id" = ${datasetId}::uuid
  `);
  if (updated !== orderedIds.length) throw new Error("Dataset item changed during position update");
};

export class DatasetRepository {
  constructor(private readonly client: PrismaClient = getDatabaseClient()) {}

  async create(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly createdByUserId: string;
    readonly name: string;
    readonly description: string | null;
  }) {
    try {
      const dataset = await this.client.dataset.create({
        data: { ...input, status: "ACTIVE" },
        include: datasetInclude,
      });
      return { state: "CREATED", dataset: toDataset(dataset) } as const;
    } catch (error) {
      if (isUniqueConflict(error)) return { state: "NAME_CONFLICT" } as const;
      throw error;
    }
  }

  async findByWorkspaceAndId(workspaceId: string, datasetId: string) {
    const dataset = await this.client.dataset.findUnique({
      where: { workspaceId_id: { workspaceId, id: datasetId } },
      include: datasetInclude,
    });
    return dataset === null ? null : toDataset(dataset);
  }

  async list(input: {
    readonly workspaceId: string;
    readonly includeArchived: boolean;
    readonly limit: number;
    readonly before?: { readonly createdAt: Date; readonly id: string };
  }) {
    const datasets = await this.client.dataset.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.includeArchived ? {} : { status: "ACTIVE" }),
        ...(input.before === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: input.before.createdAt } },
                { createdAt: input.before.createdAt, id: { lt: input.before.id } },
              ],
            }),
      },
      include: datasetInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    return {
      datasets: datasets.slice(0, input.limit).map(toDataset),
      hasMore: datasets.length > input.limit,
    };
  }

  async listItems(input: {
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly limit: number;
    readonly after?: { readonly position: number; readonly id: string };
  }) {
    const items = await this.client.datasetItem.findMany({
      where: {
        workspaceId: input.workspaceId,
        datasetId: input.datasetId,
        ...(input.after === undefined
          ? {}
          : {
              OR: [
                { position: { gt: input.after.position } },
                { position: input.after.position, id: { gt: input.after.id } },
              ],
            }),
      },
      include: itemInclude,
      orderBy: [{ position: "asc" }, { id: "asc" }],
      take: input.limit + 1,
    });
    return { items: items.slice(0, input.limit).map(toItem), hasMore: items.length > input.limit };
  }

  async updateMetadata(input: {
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly expectedVersion: number;
    readonly name?: string;
    readonly description?: string | null;
  }) {
    try {
      return await this.client.$transaction(async (tx) => {
        const current = await findDataset(tx, input.workspaceId, input.datasetId);
        const state = mutationState(current, input.expectedVersion);
        if (state !== null) return { state } as const;
        const updated = await tx.dataset.updateMany({
          where: {
            id: input.datasetId,
            workspaceId: input.workspaceId,
            status: "ACTIVE",
            version: input.expectedVersion,
          },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.description === undefined ? {} : { description: input.description }),
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) return { state: "CONFLICT" } as const;
        const dataset = await findDataset(tx, input.workspaceId, input.datasetId);
        if (dataset === null) return { state: "NOT_FOUND" } as const;
        return { state: "UPDATED", dataset: toDataset(dataset) } as const;
      });
    } catch (error) {
      if (isUniqueConflict(error)) return { state: "NAME_CONFLICT" } as const;
      throw error;
    }
  }

  async archive(input: {
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly expectedVersion: number;
  }) {
    return this.client.$transaction(async (tx) => {
      const current = await findDataset(tx, input.workspaceId, input.datasetId);
      const state = mutationState(current, input.expectedVersion);
      if (state !== null) return { state } as const;
      const updated = await tx.dataset.updateMany({
        where: {
          id: input.datasetId,
          workspaceId: input.workspaceId,
          status: "ACTIVE",
          version: input.expectedVersion,
        },
        data: { status: "ARCHIVED", version: { increment: 1 } },
      });
      if (updated.count !== 1) return { state: "CONFLICT" } as const;
      const dataset = await findDataset(tx, input.workspaceId, input.datasetId);
      if (dataset === null) return { state: "NOT_FOUND" } as const;
      return { state: "ARCHIVED", dataset: toDataset(dataset) } as const;
    });
  }

  async addItem(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly mediaAssetId: string;
    readonly captionOverride: string | null;
    readonly expectedVersion: number;
    readonly maximumItems: number;
  }) {
    try {
      return await this.client.$transaction(async (tx) => {
        const current = await findDataset(tx, input.workspaceId, input.datasetId);
        const state = mutationState(current, input.expectedVersion);
        if (state !== null) return { state } as const;
        const media = await tx.mediaAsset.findUnique({
          where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.mediaAssetId } },
          select: { status: true },
        });
        if (media?.status !== "READY") return { state: "MEDIA_NOT_READY" } as const;
        const existing = await tx.datasetItem.findUnique({
          where: {
            datasetId_mediaAssetId: {
              datasetId: input.datasetId,
              mediaAssetId: input.mediaAssetId,
            },
          },
          select: { id: true },
        });
        if (existing !== null) return { state: "DUPLICATE_MEDIA" } as const;
        if ((current?._count.items ?? 0) >= input.maximumItems)
          return { state: "ITEM_LIMIT" } as const;
        if (!(await claimMutation(tx, input.workspaceId, input.datasetId, input.expectedVersion))) {
          return { state: "CONFLICT" } as const;
        }
        const item = await tx.datasetItem.create({
          data: {
            id: input.id,
            workspaceId: input.workspaceId,
            datasetId: input.datasetId,
            mediaAssetId: input.mediaAssetId,
            position: current?._count.items ?? 0,
            captionOverride: input.captionOverride,
          },
          include: itemInclude,
        });
        const dataset = await findDataset(tx, input.workspaceId, input.datasetId);
        if (dataset === null) return { state: "NOT_FOUND" } as const;
        return { state: "ADDED", dataset: toDataset(dataset), item: toItem(item) } as const;
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        const existing = await this.client.datasetItem.findUnique({
          where: {
            datasetId_mediaAssetId: {
              datasetId: input.datasetId,
              mediaAssetId: input.mediaAssetId,
            },
          },
          select: { workspaceId: true },
        });
        return existing?.workspaceId === input.workspaceId
          ? ({ state: "DUPLICATE_MEDIA" } as const)
          : ({ state: "CONFLICT" } as const);
      }
      throw error;
    }
  }

  async updateItem(input: {
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly itemId: string;
    readonly captionOverride: string | null;
    readonly expectedVersion: number;
  }) {
    return this.client.$transaction(async (tx) => {
      const current = await findDataset(tx, input.workspaceId, input.datasetId);
      const state = mutationState(current, input.expectedVersion);
      if (state !== null) return { state } as const;
      const item = await tx.datasetItem.findUnique({
        where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.itemId } },
        select: { datasetId: true },
      });
      if (item?.datasetId !== input.datasetId) return { state: "ITEM_NOT_FOUND" } as const;
      if (!(await claimMutation(tx, input.workspaceId, input.datasetId, input.expectedVersion)))
        return { state: "CONFLICT" } as const;
      const updated = await tx.datasetItem.update({
        where: { id: input.itemId },
        data: { captionOverride: input.captionOverride },
        include: itemInclude,
      });
      const dataset = await findDataset(tx, input.workspaceId, input.datasetId);
      if (dataset === null) return { state: "NOT_FOUND" } as const;
      return { state: "UPDATED", dataset: toDataset(dataset), item: toItem(updated) } as const;
    });
  }

  async removeItem(input: {
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly itemId: string;
    readonly expectedVersion: number;
  }) {
    return this.client.$transaction(async (tx) => {
      const current = await findDataset(tx, input.workspaceId, input.datasetId);
      const state = mutationState(current, input.expectedVersion);
      if (state !== null) return { state } as const;
      const item = await tx.datasetItem.findUnique({
        where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.itemId } },
        select: { datasetId: true },
      });
      if (item?.datasetId !== input.datasetId) return { state: "ITEM_NOT_FOUND" } as const;
      if (!(await claimMutation(tx, input.workspaceId, input.datasetId, input.expectedVersion)))
        return { state: "CONFLICT" } as const;
      await tx.datasetItem.delete({ where: { id: input.itemId } });
      const remaining = await tx.datasetItem.findMany({
        where: { workspaceId: input.workspaceId, datasetId: input.datasetId },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      await normalizePositions(
        tx,
        input.workspaceId,
        input.datasetId,
        remaining.map(({ id }) => id),
      );
      const dataset = await findDataset(tx, input.workspaceId, input.datasetId);
      if (dataset === null) return { state: "NOT_FOUND" } as const;
      return { state: "REMOVED", dataset: toDataset(dataset) } as const;
    });
  }

  async reorder(input: {
    readonly workspaceId: string;
    readonly datasetId: string;
    readonly itemIds: readonly string[];
    readonly expectedVersion: number;
  }) {
    return this.client.$transaction(async (tx) => {
      const current = await findDataset(tx, input.workspaceId, input.datasetId);
      const state = mutationState(current, input.expectedVersion);
      if (state !== null) return { state } as const;
      const existing = await tx.datasetItem.findMany({
        where: { workspaceId: input.workspaceId, datasetId: input.datasetId },
        select: { id: true },
      });
      const existingIds = new Set(existing.map(({ id }) => id));
      if (
        input.itemIds.length !== existingIds.size ||
        new Set(input.itemIds).size !== input.itemIds.length ||
        input.itemIds.some((id) => !existingIds.has(id))
      ) {
        return { state: "INVALID_ORDER" } as const;
      }
      if (!(await claimMutation(tx, input.workspaceId, input.datasetId, input.expectedVersion)))
        return { state: "CONFLICT" } as const;
      await normalizePositions(tx, input.workspaceId, input.datasetId, input.itemIds);
      const [dataset, items] = await Promise.all([
        findDataset(tx, input.workspaceId, input.datasetId),
        tx.datasetItem.findMany({
          where: { workspaceId: input.workspaceId, datasetId: input.datasetId },
          include: itemInclude,
          orderBy: [{ position: "asc" }, { id: "asc" }],
        }),
      ]);
      if (dataset === null) return { state: "NOT_FOUND" } as const;
      return { state: "REORDERED", dataset: toDataset(dataset), items: items.map(toItem) } as const;
    });
  }
}
