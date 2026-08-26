import {
  Prisma,
  PrismaClient,
  type Dataset,
  type Project,
  type Prisma as PrismaNamespace,
} from "@prisma/client";
import { ProjectPostingWindowSchema, ProjectStatusSchema } from "@otshop/shared";

import { getDatabaseClient } from "./client";

type Transaction = PrismaNamespace.TransactionClient;
type ProjectWithDataset = Project & {
  readonly dataset: Pick<Dataset, "id" | "name" | "status"> & {
    readonly _count: { readonly items: number };
  };
};

const projectInclude = {
  dataset: { select: { id: true, name: true, status: true, _count: { select: { items: true } } } },
} as const;

const toProject = (project: ProjectWithDataset) => ({
  id: project.id,
  workspaceId: project.workspaceId,
  datasetId: project.datasetId,
  accountId: project.accountId,
  name: project.name,
  description: project.description,
  status: ProjectStatusSchema.parse(project.status),
  dailyTarget: project.dailyTarget,
  postingTimezone: project.postingTimezone,
  postingWindowStart: project.postingWindowStart,
  postingWindowEnd: project.postingWindowEnd,
  createdByUserId: project.createdByUserId,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  version: project.version,
  dataset: {
    id: project.dataset.id,
    name: project.dataset.name,
    status: project.dataset.status,
    itemCount: project.dataset._count.items,
  },
});

const isUniqueConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const isSerializationConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";

const findProject = (tx: Transaction, workspaceId: string, projectId: string) =>
  tx.project.findUnique({
    where: { workspaceId_id: { workspaceId, id: projectId } },
    include: projectInclude,
  });

const datasetUsable = async (tx: Transaction, workspaceId: string, datasetId: string) =>
  (await tx.dataset.count({ where: { id: datasetId, workspaceId, status: "ACTIVE" } })) === 1;

const accountExists = async (tx: Transaction, workspaceId: string, accountId: string | null) =>
  accountId === null ||
  (await tx.shopeeAccount.count({ where: { id: accountId, workspaceId, status: "ACTIVE" } })) === 1;

const postingWindowValid = (project: ProjectWithDataset): boolean => {
  if (
    project.postingTimezone === null &&
    project.postingWindowStart === null &&
    project.postingWindowEnd === null
  ) {
    return true;
  }
  return ProjectPostingWindowSchema.safeParse({
    timezone: project.postingTimezone,
    startLocalTime: project.postingWindowStart,
    endLocalTime: project.postingWindowEnd,
  }).success;
};

const materializedItemsReady = async (
  tx: Transaction,
  workspaceId: string,
  projectId: string,
  datasetId: string,
  accountId: string | null,
): Promise<boolean> => {
  const [sources, materialized] = await Promise.all([
    tx.datasetItem.findMany({
      where: { workspaceId, datasetId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: {
        id: true,
        mediaAssetId: true,
        position: true,
        mediaAsset: { select: { status: true } },
      },
    }),
    tx.projectItem.findMany({
      where: { workspaceId, projectId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: {
        datasetItemId: true,
        mediaAssetId: true,
        position: true,
        status: true,
        products: {
          select: {
            position: true,
            productReference: { select: { accountId: true, source: true, status: true } },
          },
        },
      },
    }),
  ]);
  return (
    sources.length > 0 &&
    materialized.length === sources.length &&
    sources.every((source, index) => {
      const item = materialized[index];
      const assignment = item?.products[0];
      const assignmentValid =
        item !== undefined &&
        item.products.length <= 1 &&
        (assignment === undefined ||
          (assignment.position === 0 &&
            assignment.productReference.status === "ACTIVE" &&
            assignment.productReference.source === "MANUAL" &&
            accountId !== null &&
            assignment.productReference.accountId === accountId));
      return (
        source.mediaAsset.status === "READY" &&
        item?.status === "ACTIVE" &&
        item.datasetItemId === source.id &&
        item.mediaAssetId === source.mediaAssetId &&
        item.position === source.position &&
        assignmentValid
      );
    })
  );
};

const mutationState = (
  project: ProjectWithDataset | null,
  expectedVersion: number,
): "ARCHIVED" | "CONFLICT" | "NOT_FOUND" | null => {
  if (project === null) return "NOT_FOUND";
  if (project.status === "ARCHIVED") return "ARCHIVED";
  return project.version === expectedVersion ? null : "CONFLICT";
};

export class ProjectRepository {
  constructor(private readonly client: PrismaClient = getDatabaseClient()) {}

  async create(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly createdByUserId: string;
    readonly datasetId: string;
    readonly accountId: string | null;
    readonly name: string;
    readonly description: string | null;
    readonly dailyTarget: number | null;
    readonly postingTimezone: string | null;
    readonly postingWindowStart: string | null;
    readonly postingWindowEnd: string | null;
  }) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          if (!(await datasetUsable(tx, input.workspaceId, input.datasetId))) {
            return { state: "INVALID_DATASET" } as const;
          }
          if (!(await accountExists(tx, input.workspaceId, input.accountId))) {
            return { state: "INVALID_ACCOUNT" } as const;
          }
          const project = await tx.project.create({
            data: {
              ...input,
              status: "DRAFT",
            },
            include: projectInclude,
          });
          return { state: "CREATED", project: toProject(project) } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueConflict(error)) return { state: "NAME_CONFLICT" } as const;
      throw error;
    }
  }

  async findByWorkspaceAndId(workspaceId: string, projectId: string) {
    const project = await this.client.project.findUnique({
      where: { workspaceId_id: { workspaceId, id: projectId } },
      include: projectInclude,
    });
    return project === null ? null : toProject(project);
  }

  async list(input: {
    readonly workspaceId: string;
    readonly includeArchived: boolean;
    readonly limit: number;
    readonly before?: { readonly createdAt: Date; readonly id: string };
  }) {
    const projects = await this.client.project.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.includeArchived ? {} : { status: { not: "ARCHIVED" } }),
        ...(input.before === undefined
          ? {}
          : {
              OR: [
                { createdAt: { lt: input.before.createdAt } },
                { createdAt: input.before.createdAt, id: { lt: input.before.id } },
              ],
            }),
      },
      include: projectInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    return {
      projects: projects.slice(0, input.limit).map(toProject),
      hasMore: projects.length > input.limit,
    };
  }

  async update(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly expectedVersion: number;
    readonly datasetId?: string;
    readonly accountId?: string | null;
    readonly name?: string;
    readonly description?: string | null;
    readonly dailyTarget?: number | null;
    readonly postingTimezone?: string | null;
    readonly postingWindowStart?: string | null;
    readonly postingWindowEnd?: string | null;
  }) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const current = await findProject(tx, input.workspaceId, input.projectId);
          const state = mutationState(current, input.expectedVersion);
          if (state !== null) return { state } as const;
          if (current!.status !== "DRAFT") return { state: "NOT_CONFIGURABLE" } as const;
          if (
            input.datasetId !== undefined &&
            !(await datasetUsable(tx, input.workspaceId, input.datasetId))
          ) {
            return { state: "INVALID_DATASET" } as const;
          }
          if (
            input.accountId !== undefined &&
            !(await accountExists(tx, input.workspaceId, input.accountId))
          ) {
            return { state: "INVALID_ACCOUNT" } as const;
          }
          if (input.accountId !== undefined) {
            const incompatibleAssignments = await tx.projectItemProduct.count({
              where: {
                workspaceId: input.workspaceId,
                projectItem: { projectId: input.projectId },
                ...(input.accountId === null
                  ? {}
                  : { productReference: { accountId: { not: input.accountId } } }),
              },
            });
            if (incompatibleAssignments > 0) return { state: "INVALID_ACCOUNT" } as const;
          }
          const updated = await tx.project.updateMany({
            where: {
              id: input.projectId,
              workspaceId: input.workspaceId,
              status: "DRAFT",
              version: input.expectedVersion,
            },
            data: {
              ...(input.datasetId === undefined ? {} : { datasetId: input.datasetId }),
              ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
              ...(input.name === undefined ? {} : { name: input.name }),
              ...(input.description === undefined ? {} : { description: input.description }),
              ...(input.dailyTarget === undefined ? {} : { dailyTarget: input.dailyTarget }),
              ...(input.postingTimezone === undefined
                ? {}
                : { postingTimezone: input.postingTimezone }),
              ...(input.postingWindowStart === undefined
                ? {}
                : { postingWindowStart: input.postingWindowStart }),
              ...(input.postingWindowEnd === undefined
                ? {}
                : { postingWindowEnd: input.postingWindowEnd }),
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) return { state: "CONFLICT" } as const;
          return {
            state: "UPDATED",
            project: toProject((await findProject(tx, input.workspaceId, input.projectId))!),
          } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueConflict(error)) return { state: "NAME_CONFLICT" } as const;
      if (isSerializationConflict(error)) return { state: "CONFLICT" } as const;
      throw error;
    }
  }

  async markReady(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly expectedVersion: number;
  }) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const current = await findProject(tx, input.workspaceId, input.projectId);
          const state = mutationState(current, input.expectedVersion);
          if (state !== null) return { state } as const;
          if (
            current!.status !== "DRAFT" ||
            current!.dailyTarget === null ||
            current!.dataset.status !== "ACTIVE" ||
            !(await materializedItemsReady(
              tx,
              input.workspaceId,
              input.projectId,
              current!.datasetId,
              current!.accountId,
            )) ||
            !postingWindowValid(current!) ||
            !(await accountExists(tx, input.workspaceId, current!.accountId))
          ) {
            return { state: "NOT_CONFIGURABLE" } as const;
          }
          const updated = await tx.project.updateMany({
            where: {
              id: input.projectId,
              workspaceId: input.workspaceId,
              status: "DRAFT",
              version: input.expectedVersion,
            },
            data: { status: "READY", version: { increment: 1 } },
          });
          if (updated.count !== 1) return { state: "CONFLICT" } as const;
          return {
            state: "READY",
            project: toProject((await findProject(tx, input.workspaceId, input.projectId))!),
          } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isSerializationConflict(error)) return { state: "CONFLICT" } as const;
      throw error;
    }
  }

  async archive(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly expectedVersion: number;
  }) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const current = await findProject(tx, input.workspaceId, input.projectId);
          const state = mutationState(current, input.expectedVersion);
          if (state !== null) return { state } as const;
          const updated = await tx.project.updateMany({
            where: {
              id: input.projectId,
              workspaceId: input.workspaceId,
              status: { in: ["DRAFT", "READY"] },
              version: input.expectedVersion,
            },
            data: { status: "ARCHIVED", version: { increment: 1 } },
          });
          if (updated.count !== 1) return { state: "CONFLICT" } as const;
          return {
            state: "ARCHIVED",
            project: toProject((await findProject(tx, input.workspaceId, input.projectId))!),
          } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isSerializationConflict(error)) return { state: "CONFLICT" } as const;
      throw error;
    }
  }
}
