import { Prisma, PrismaClient, type Prisma as PrismaNamespace } from "@prisma/client";
import { createUuidV7 } from "@otshop/shared";

import { getDatabaseClient } from "./client";

type Transaction = PrismaNamespace.TransactionClient;

export type ProjectItemMaterializationFailure =
  | "ARCHIVED"
  | "CONFLICT"
  | "INVALID_DATASET"
  | "NOT_CONFIGURABLE"
  | "NOT_FOUND"
  | "RECONCILIATION_CONFLICT";

export interface ProjectItemMaterializationRecord {
  readonly projectId: string;
  readonly datasetId: string;
  readonly projectVersion: number;
  readonly itemCount: number;
  readonly createdCount: number;
  readonly removedCount: number;
  readonly reorderedCount: number;
  readonly changed: boolean;
}

const isEmptyObject = (value: PrismaNamespace.JsonValue): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === 0;

const isSerializationConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";

const isConstraintConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003"].includes(error.code);

const normalizePositions = async (
  tx: Transaction,
  workspaceId: string,
  projectId: string,
  assignments: readonly { readonly id: string; readonly position: number }[],
): Promise<void> => {
  if (assignments.length === 0) return;
  await tx.$executeRaw`SET CONSTRAINTS "project_items_project_position_key" DEFERRED`;
  const values = assignments.map(
    ({ id, position }) => Prisma.sql`(${id}::uuid, ${position}::integer)`,
  );
  const updated = await tx.$executeRaw(Prisma.sql`
    UPDATE "project_items" AS item
    SET "position" = ordering."position"
    FROM (VALUES ${Prisma.join(values)}) AS ordering("id", "position")
    WHERE item."id" = ordering."id"
      AND item."workspace_id" = ${workspaceId}::uuid
      AND item."project_id" = ${projectId}::uuid
  `);
  if (updated !== assignments.length) throw new Error("Project item set changed during ordering");
};

export class ProjectItemRepository {
  constructor(
    private readonly client: PrismaClient = getDatabaseClient(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async materialize(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly expectedVersion: number;
  }): Promise<
    | { readonly state: "MATERIALIZED"; readonly result: ProjectItemMaterializationRecord }
    | { readonly state: ProjectItemMaterializationFailure }
  > {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const project = await tx.project.findUnique({
            where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.projectId } },
            select: {
              id: true,
              datasetId: true,
              status: true,
              version: true,
              dataset: { select: { status: true } },
            },
          });
          if (project === null) return { state: "NOT_FOUND" } as const;
          if (project.status === "ARCHIVED") return { state: "ARCHIVED" } as const;
          if (project.version !== input.expectedVersion) return { state: "CONFLICT" } as const;
          if (project.status !== "DRAFT") return { state: "NOT_CONFIGURABLE" } as const;
          if (project.dataset.status !== "ACTIVE") return { state: "INVALID_DATASET" } as const;

          const [sources, existing] = await Promise.all([
            tx.datasetItem.findMany({
              where: { workspaceId: input.workspaceId, datasetId: project.datasetId },
              orderBy: [{ position: "asc" }, { id: "asc" }],
              select: { id: true, mediaAssetId: true, position: true },
            }),
            tx.projectItem.findMany({
              where: { workspaceId: input.workspaceId, projectId: input.projectId },
              select: {
                id: true,
                datasetItemId: true,
                mediaAssetId: true,
                position: true,
                caption: true,
                status: true,
                customFields: true,
                _count: { select: { products: true, publishJobs: true } },
              },
            }),
          ]);
          const sourceIds = new Set(sources.map(({ id }) => id));
          const removed = existing.filter((item) => !sourceIds.has(item.datasetItemId));
          const removalIsSafe = removed.every(
            (item) =>
              item.status === "ACTIVE" &&
              item.caption === null &&
              isEmptyObject(item.customFields) &&
              item._count.products === 0 &&
              item._count.publishJobs === 0,
          );
          if (!removalIsSafe || existing.some(({ status }) => status !== "ACTIVE")) {
            return { state: "RECONCILIATION_CONFLICT" } as const;
          }

          const existingBySource = new Map(existing.map((item) => [item.datasetItemId, item]));
          const missing = sources.filter((source) => !existingBySource.has(source.id));
          const reorderedCount = sources.filter((source) => {
            const item = existingBySource.get(source.id);
            return (
              item !== undefined &&
              (item.position !== source.position || item.mediaAssetId !== source.mediaAssetId)
            );
          }).length;
          const changed = missing.length > 0 || removed.length > 0 || reorderedCount > 0;
          if (!changed) {
            return {
              state: "MATERIALIZED",
              result: {
                projectId: project.id,
                datasetId: project.datasetId,
                projectVersion: project.version,
                itemCount: sources.length,
                createdCount: 0,
                removedCount: 0,
                reorderedCount: 0,
                changed: false,
              },
            } as const;
          }

          const claimed = await tx.project.updateMany({
            where: {
              id: input.projectId,
              workspaceId: input.workspaceId,
              status: "DRAFT",
              version: input.expectedVersion,
            },
            data: { version: { increment: 1 } },
          });
          if (claimed.count !== 1) return { state: "CONFLICT" } as const;

          await tx.$executeRaw`SET CONSTRAINTS "project_items_project_position_key" DEFERRED`;
          if (removed.length > 0) {
            await tx.projectItem.deleteMany({
              where: { id: { in: removed.map(({ id }) => id) }, workspaceId: input.workspaceId },
            });
          }
          const now = this.clock().getTime();
          const newIds = new Map(
            missing.map((source, index) => [source.id, createUuidV7(now + index)]),
          );
          if (missing.length > 0) {
            await tx.projectItem.createMany({
              data: missing.map((source) => ({
                id: newIds.get(source.id)!,
                workspaceId: input.workspaceId,
                projectId: input.projectId,
                datasetItemId: source.id,
                mediaAssetId: source.mediaAssetId,
                position: source.position,
                caption: null,
                status: "ACTIVE",
              })),
            });
          }
          await normalizePositions(
            tx,
            input.workspaceId,
            input.projectId,
            sources.map((source) => ({
              id: existingBySource.get(source.id)?.id ?? newIds.get(source.id)!,
              position: source.position,
            })),
          );
          return {
            state: "MATERIALIZED",
            result: {
              projectId: project.id,
              datasetId: project.datasetId,
              projectVersion: project.version + 1,
              itemCount: sources.length,
              createdCount: missing.length,
              removedCount: removed.length,
              reorderedCount,
              changed: true,
            },
          } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isSerializationConflict(error) || isConstraintConflict(error)) {
        return { state: "CONFLICT" } as const;
      }
      throw error;
    }
  }
}
