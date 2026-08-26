import { Prisma, PrismaClient, type Prisma as PrismaNamespace } from "@prisma/client";
import { DATASET_MAX_ITEMS } from "@otshop/shared";

import { getDatabaseClient } from "./client";

type Transaction = PrismaNamespace.TransactionClient;

export type ProjectItemProductFailure =
  | "CONFLICT"
  | "ITEM_ARCHIVED"
  | "ITEM_LIMIT"
  | "ITEM_NOT_FOUND"
  | "PRODUCT_ACCOUNT_MISMATCH"
  | "PRODUCT_ARCHIVED"
  | "PRODUCT_NOT_FOUND"
  | "PROJECT_NOT_DRAFT"
  | "PROJECT_NOT_FOUND";

export interface ProjectItemProductRecord {
  readonly projectId: string;
  readonly projectItemId: string;
  readonly projectVersion: number;
  readonly projectStatus: string;
  readonly projectItemStatus: string;
  readonly assignment: null | {
    readonly productId: string;
    readonly accountId: string;
    readonly displayName: string;
    readonly status: string;
  };
}

const isConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  ["P2002", "P2003", "P2034"].includes(error.code);

const findProject = (tx: Transaction, workspaceId: string, projectId: string) =>
  tx.project.findUnique({
    where: { workspaceId_id: { workspaceId, id: projectId } },
    select: { id: true, accountId: true, status: true, version: true },
  });

const findItem = (tx: Transaction, workspaceId: string, projectId: string, projectItemId: string) =>
  tx.projectItem.findFirst({
    where: { id: projectItemId, workspaceId, projectId },
    select: {
      id: true,
      status: true,
      products: {
        select: {
          productReference: {
            select: { id: true, accountId: true, displayName: true, status: true },
          },
        },
      },
    },
  });

const toRecord = (
  project: { readonly id: string; readonly status: string; readonly version: number },
  item: Awaited<ReturnType<typeof findItem>> & {},
): ProjectItemProductRecord => {
  const product = item.products[0]?.productReference;
  return {
    projectId: project.id,
    projectItemId: item.id,
    projectVersion: project.version,
    projectStatus: project.status,
    projectItemStatus: item.status,
    assignment:
      product === undefined
        ? null
        : {
            productId: product.id,
            accountId: product.accountId,
            displayName: product.displayName,
            status: product.status,
          },
  };
};

const validateMutation = async (
  tx: Transaction,
  input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly projectItemId?: string;
    readonly expectedVersion: number;
  },
) => {
  const project = await findProject(tx, input.workspaceId, input.projectId);
  if (project === null) return { state: "PROJECT_NOT_FOUND" } as const;
  if (project.status !== "DRAFT") return { state: "PROJECT_NOT_DRAFT" } as const;
  if (project.version !== input.expectedVersion) return { state: "CONFLICT" } as const;
  if (input.projectItemId === undefined) return { state: "VALID", project } as const;
  const item = await findItem(tx, input.workspaceId, input.projectId, input.projectItemId);
  if (item === null) return { state: "ITEM_NOT_FOUND" } as const;
  if (item.status !== "ACTIVE") return { state: "ITEM_ARCHIVED" } as const;
  return { state: "VALID", project, item } as const;
};

const validateProduct = async (
  tx: Transaction,
  workspaceId: string,
  productId: string,
  accountId: string | null,
) => {
  const product = await tx.productReference.findUnique({
    where: { workspaceId_id: { workspaceId, id: productId } },
    select: { id: true, accountId: true, source: true, status: true },
  });
  if (product === null || product.source !== "MANUAL") return "PRODUCT_NOT_FOUND" as const;
  if (product.status !== "ACTIVE") return "PRODUCT_ARCHIVED" as const;
  if (accountId === null || product.accountId !== accountId) {
    return "PRODUCT_ACCOUNT_MISMATCH" as const;
  }
  return product;
};

const claimProject = async (
  tx: Transaction,
  workspaceId: string,
  projectId: string,
  expectedVersion: number,
): Promise<boolean> =>
  (
    await tx.project.updateMany({
      where: { id: projectId, workspaceId, status: "DRAFT", version: expectedVersion },
      data: { version: { increment: 1 } },
    })
  ).count === 1;

export class ProjectItemProductRepository {
  constructor(private readonly client: PrismaClient = getDatabaseClient()) {}

  async find(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly projectItemId: string;
  }) {
    const project = await this.client.project.findUnique({
      where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.projectId } },
      select: { id: true, status: true, version: true },
    });
    if (project === null) return { state: "PROJECT_NOT_FOUND" } as const;
    const item = await this.client.projectItem.findFirst({
      where: {
        id: input.projectItemId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
      },
      select: {
        id: true,
        status: true,
        products: {
          select: {
            productReference: {
              select: { id: true, accountId: true, displayName: true, status: true },
            },
          },
        },
      },
    });
    return item === null
      ? ({ state: "ITEM_NOT_FOUND" } as const)
      : ({ state: "FOUND", result: toRecord(project, item) } as const);
  }

  async assign(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly projectItemId: string;
    readonly productId: string;
    readonly expectedVersion: number;
  }) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const validated = await validateMutation(tx, input);
          if (validated.state !== "VALID") return validated;
          const currentItem = validated.item;
          if (currentItem === undefined) return { state: "ITEM_NOT_FOUND" } as const;
          const product = await validateProduct(
            tx,
            input.workspaceId,
            input.productId,
            validated.project.accountId,
          );
          if (typeof product === "string") return { state: product } as const;
          const currentProductId = currentItem.products[0]?.productReference.id;
          if (currentProductId === product.id) {
            return {
              state: "ASSIGNED",
              changed: false,
              result: toRecord(validated.project, currentItem),
            } as const;
          }
          if (
            !(await claimProject(tx, input.workspaceId, input.projectId, input.expectedVersion))
          ) {
            return { state: "CONFLICT" } as const;
          }
          await tx.projectItemProduct.deleteMany({
            where: { workspaceId: input.workspaceId, projectItemId: input.projectItemId },
          });
          await tx.projectItemProduct.create({
            data: {
              workspaceId: input.workspaceId,
              projectItemId: input.projectItemId,
              productReferenceId: product.id,
              position: 0,
            },
          });
          const item = (await findItem(
            tx,
            input.workspaceId,
            input.projectId,
            input.projectItemId,
          ))!;
          return {
            state: "ASSIGNED",
            changed: true,
            result: toRecord(
              { ...validated.project, version: validated.project.version + 1 },
              item,
            ),
          } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isConflict(error)) return { state: "CONFLICT" } as const;
      throw error;
    }
  }

  async remove(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly projectItemId: string;
    readonly expectedVersion: number;
  }) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const validated = await validateMutation(tx, input);
          if (validated.state !== "VALID") return validated;
          const currentItem = validated.item;
          if (currentItem === undefined) return { state: "ITEM_NOT_FOUND" } as const;
          if (currentItem.products.length === 0) {
            return {
              state: "REMOVED",
              changed: false,
              result: toRecord(validated.project, currentItem),
            } as const;
          }
          if (
            !(await claimProject(tx, input.workspaceId, input.projectId, input.expectedVersion))
          ) {
            return { state: "CONFLICT" } as const;
          }
          await tx.projectItemProduct.deleteMany({
            where: { workspaceId: input.workspaceId, projectItemId: input.projectItemId },
          });
          const item = (await findItem(
            tx,
            input.workspaceId,
            input.projectId,
            input.projectItemId,
          ))!;
          return {
            state: "REMOVED",
            changed: true,
            result: toRecord(
              { ...validated.project, version: validated.project.version + 1 },
              item,
            ),
          } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isConflict(error)) return { state: "CONFLICT" } as const;
      throw error;
    }
  }

  async assignAll(input: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly productId: string;
    readonly expectedVersion: number;
  }) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const validated = await validateMutation(tx, input);
          if (validated.state !== "VALID") return validated;
          const product = await validateProduct(
            tx,
            input.workspaceId,
            input.productId,
            validated.project.accountId,
          );
          if (typeof product === "string") return { state: product } as const;
          const items = await tx.projectItem.findMany({
            where: { workspaceId: input.workspaceId, projectId: input.projectId, status: "ACTIVE" },
            orderBy: [{ position: "asc" }, { id: "asc" }],
            select: {
              id: true,
              products: { select: { productReferenceId: true } },
            },
            take: DATASET_MAX_ITEMS + 1,
          });
          if (items.length === 0) return { state: "ITEM_NOT_FOUND" } as const;
          if (items.length > DATASET_MAX_ITEMS) return { state: "ITEM_LIMIT" } as const;
          const changedItems = items.filter(
            (item) =>
              item.products.length !== 1 || item.products[0]?.productReferenceId !== product.id,
          );
          if (changedItems.length === 0) {
            return {
              state: "BULK_ASSIGNED",
              changed: false,
              projectId: validated.project.id,
              projectVersion: validated.project.version,
              itemCount: items.length,
              changedCount: 0,
              productId: product.id,
            } as const;
          }
          if (
            !(await claimProject(tx, input.workspaceId, input.projectId, input.expectedVersion))
          ) {
            return { state: "CONFLICT" } as const;
          }
          await tx.projectItemProduct.deleteMany({
            where: {
              workspaceId: input.workspaceId,
              projectItemId: { in: items.map(({ id }) => id) },
            },
          });
          await tx.projectItemProduct.createMany({
            data: items.map((item) => ({
              workspaceId: input.workspaceId,
              projectItemId: item.id,
              productReferenceId: product.id,
              position: 0,
            })),
          });
          return {
            state: "BULK_ASSIGNED",
            changed: true,
            projectId: validated.project.id,
            projectVersion: validated.project.version + 1,
            itemCount: items.length,
            changedCount: changedItems.length,
            productId: product.id,
          } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isConflict(error)) return { state: "CONFLICT" } as const;
      throw error;
    }
  }
}
