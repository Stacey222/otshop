import {
  Prisma,
  PrismaClient,
  type ProductReference,
  type ShopeeAccount,
  type Prisma as PrismaNamespace,
} from "@prisma/client";
import { LocalConfigurationStatusSchema } from "@otshop/shared";

import { getDatabaseClient } from "./client";

type Transaction = PrismaNamespace.TransactionClient;

const isUniqueConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
const isSerializationConflict = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";

const toAccount = (account: ShopeeAccount) => ({
  id: account.id,
  workspaceId: account.workspaceId,
  displayName: account.displayName,
  accountHandle: account.operatorReference,
  countryCode: account.countryCode,
  status: LocalConfigurationStatusSchema.parse(account.status),
  createdAt: account.createdAt,
  updatedAt: account.updatedAt,
  version: account.version,
});

const accountState = (
  account: ShopeeAccount | null,
  expectedVersion: number,
): "ARCHIVED" | "CONFLICT" | "NOT_FOUND" | null => {
  if (account === null) return "NOT_FOUND";
  if (account.status === "ARCHIVED") return "ARCHIVED";
  return account.version === expectedVersion ? null : "CONFLICT";
};

export class ShopeeAccountRepository {
  constructor(private readonly client: PrismaClient = getDatabaseClient()) {}

  async create(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly displayName: string;
    readonly accountHandle: string | null;
    readonly countryCode: string;
  }) {
    try {
      const account = await this.client.shopeeAccount.create({
        data: {
          id: input.id,
          workspaceId: input.workspaceId,
          displayName: input.displayName,
          operatorReference: input.accountHandle,
          countryCode: input.countryCode,
          status: "ACTIVE",
        },
      });
      return { state: "CREATED", account: toAccount(account) } as const;
    } catch (error) {
      if (isUniqueConflict(error)) return { state: "CONFLICT" } as const;
      throw error;
    }
  }

  async findByWorkspaceAndId(workspaceId: string, accountId: string) {
    const account = await this.client.shopeeAccount.findUnique({
      where: { workspaceId_id: { workspaceId, id: accountId } },
    });
    return account === null ? null : toAccount(account);
  }

  async list(input: {
    readonly workspaceId: string;
    readonly includeArchived: boolean;
    readonly limit: number;
    readonly before?: { readonly createdAt: Date; readonly id: string };
  }) {
    const accounts = await this.client.shopeeAccount.findMany({
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    return {
      accounts: accounts.slice(0, input.limit).map(toAccount),
      hasMore: accounts.length > input.limit,
    };
  }

  async update(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly expectedVersion: number;
    readonly displayName?: string;
    readonly accountHandle?: string | null;
    readonly countryCode?: string;
  }) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const current = await tx.shopeeAccount.findUnique({
            where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.accountId } },
          });
          const state = accountState(current, input.expectedVersion);
          if (state !== null) return { state } as const;
          const claimed = await tx.shopeeAccount.updateMany({
            where: {
              id: input.accountId,
              workspaceId: input.workspaceId,
              status: "ACTIVE",
              version: input.expectedVersion,
            },
            data: {
              ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
              ...(input.accountHandle === undefined
                ? {}
                : { operatorReference: input.accountHandle }),
              ...(input.countryCode === undefined ? {} : { countryCode: input.countryCode }),
              version: { increment: 1 },
            },
          });
          if (claimed.count !== 1) return { state: "CONFLICT" } as const;
          const account = await tx.shopeeAccount.findUniqueOrThrow({
            where: { id: input.accountId },
          });
          return { state: "UPDATED", account: toAccount(account) } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueConflict(error) || isSerializationConflict(error))
        return { state: "CONFLICT" } as const;
      throw error;
    }
  }

  async archive(input: {
    readonly workspaceId: string;
    readonly accountId: string;
    readonly expectedVersion: number;
  }) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const current = await tx.shopeeAccount.findUnique({
            where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.accountId } },
          });
          const state = accountState(current, input.expectedVersion);
          if (state !== null) return { state } as const;
          const claimed = await tx.shopeeAccount.updateMany({
            where: {
              id: input.accountId,
              workspaceId: input.workspaceId,
              status: "ACTIVE",
              version: input.expectedVersion,
            },
            data: { status: "ARCHIVED", version: { increment: 1 } },
          });
          if (claimed.count !== 1) return { state: "CONFLICT" } as const;
          const account = await tx.shopeeAccount.findUniqueOrThrow({
            where: { id: input.accountId },
          });
          return { state: "ARCHIVED", account: toAccount(account) } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isSerializationConflict(error)) return { state: "CONFLICT" } as const;
      throw error;
    }
  }
}

type ProductWithAccount = ProductReference & {
  readonly account: Pick<ShopeeAccount, "id" | "displayName" | "status">;
};
const productInclude = {
  account: { select: { id: true, displayName: true, status: true } },
} as const;
const toProduct = (product: ProductWithAccount) => ({
  id: product.id,
  workspaceId: product.workspaceId,
  accountId: product.accountId,
  displayName: product.displayName,
  productUrl: product.productUrl,
  productIdentifier: product.operatorReference,
  status: LocalConfigurationStatusSchema.parse(product.status),
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
  version: product.version,
  account: {
    id: product.account.id,
    displayName: product.account.displayName,
    status: product.account.status,
  },
});

const productState = (
  product: ProductWithAccount | null,
  expectedVersion: number,
): "ARCHIVED" | "CONFLICT" | "NOT_FOUND" | null => {
  if (product === null) return "NOT_FOUND";
  if (product.status === "ARCHIVED") return "ARCHIVED";
  return product.version === expectedVersion ? null : "CONFLICT";
};

const activeAccount = async (tx: Transaction, workspaceId: string, accountId: string) =>
  (await tx.shopeeAccount.count({ where: { id: accountId, workspaceId, status: "ACTIVE" } })) === 1;

export class AffiliateProductRepository {
  constructor(private readonly client: PrismaClient = getDatabaseClient()) {}

  async create(input: {
    readonly id: string;
    readonly workspaceId: string;
    readonly accountId: string;
    readonly displayName: string;
    readonly productUrl: string | null;
    readonly productIdentifier: string | null;
  }) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          if (!(await activeAccount(tx, input.workspaceId, input.accountId)))
            return { state: "INVALID_ACCOUNT" } as const;
          const product = await tx.productReference.create({
            data: {
              id: input.id,
              workspaceId: input.workspaceId,
              accountId: input.accountId,
              displayName: input.displayName,
              productUrl: input.productUrl,
              operatorReference: input.productIdentifier,
              source: "MANUAL",
              status: "ACTIVE",
            },
            include: productInclude,
          });
          return { state: "CREATED", product: toProduct(product) } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueConflict(error)) return { state: "CONFLICT" } as const;
      if (isSerializationConflict(error)) return { state: "CONFLICT" } as const;
      throw error;
    }
  }

  async findByWorkspaceAndId(workspaceId: string, productId: string) {
    const product = await this.client.productReference.findUnique({
      where: { workspaceId_id: { workspaceId, id: productId } },
      include: productInclude,
    });
    return product === null ? null : toProduct(product);
  }

  async list(input: {
    readonly workspaceId: string;
    readonly includeArchived: boolean;
    readonly limit: number;
    readonly before?: { readonly createdAt: Date; readonly id: string };
  }) {
    const products = await this.client.productReference.findMany({
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
      include: productInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    return {
      products: products.slice(0, input.limit).map(toProduct),
      hasMore: products.length > input.limit,
    };
  }

  async update(input: {
    readonly workspaceId: string;
    readonly productId: string;
    readonly expectedVersion: number;
    readonly accountId?: string;
    readonly displayName?: string;
    readonly productUrl?: string | null;
    readonly productIdentifier?: string | null;
  }) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const current = await tx.productReference.findUnique({
            where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.productId } },
            include: productInclude,
          });
          const state = productState(current, input.expectedVersion);
          if (state !== null) return { state } as const;
          const accountId = input.accountId ?? current!.accountId;
          if (!(await activeAccount(tx, input.workspaceId, accountId)))
            return { state: "INVALID_ACCOUNT" } as const;
          if (input.accountId !== undefined) {
            const incompatibleAssignments = await tx.projectItemProduct.count({
              where: {
                workspaceId: input.workspaceId,
                productReferenceId: input.productId,
                projectItem: { project: { accountId: { not: input.accountId } } },
              },
            });
            if (incompatibleAssignments > 0) return { state: "INVALID_ACCOUNT" } as const;
          }
          const productUrl =
            input.productUrl === undefined ? current!.productUrl : input.productUrl;
          const productIdentifier =
            input.productIdentifier === undefined
              ? current!.operatorReference
              : input.productIdentifier;
          if (productUrl === null && productIdentifier === null)
            return { state: "INVALID_REFERENCE" } as const;
          const claimed = await tx.productReference.updateMany({
            where: {
              id: input.productId,
              workspaceId: input.workspaceId,
              status: "ACTIVE",
              version: input.expectedVersion,
            },
            data: {
              ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
              ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
              ...(input.productUrl === undefined ? {} : { productUrl: input.productUrl }),
              ...(input.productIdentifier === undefined
                ? {}
                : { operatorReference: input.productIdentifier }),
              version: { increment: 1 },
            },
          });
          if (claimed.count !== 1) return { state: "CONFLICT" } as const;
          const product = await tx.productReference.findUniqueOrThrow({
            where: { id: input.productId },
            include: productInclude,
          });
          return { state: "UPDATED", product: toProduct(product) } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isUniqueConflict(error) || isSerializationConflict(error))
        return { state: "CONFLICT" } as const;
      throw error;
    }
  }

  async archive(input: {
    readonly workspaceId: string;
    readonly productId: string;
    readonly expectedVersion: number;
  }) {
    try {
      return await this.client.$transaction(
        async (tx) => {
          const current = await tx.productReference.findUnique({
            where: { workspaceId_id: { workspaceId: input.workspaceId, id: input.productId } },
            include: productInclude,
          });
          const state = productState(current, input.expectedVersion);
          if (state !== null) return { state } as const;
          const claimed = await tx.productReference.updateMany({
            where: {
              id: input.productId,
              workspaceId: input.workspaceId,
              status: "ACTIVE",
              version: input.expectedVersion,
            },
            data: { status: "ARCHIVED", version: { increment: 1 } },
          });
          if (claimed.count !== 1) return { state: "CONFLICT" } as const;
          const product = await tx.productReference.findUniqueOrThrow({
            where: { id: input.productId },
            include: productInclude,
          });
          return { state: "ARCHIVED", product: toProduct(product) } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isSerializationConflict(error)) return { state: "CONFLICT" } as const;
      throw error;
    }
  }
}
