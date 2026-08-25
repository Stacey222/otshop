import { z } from "zod";

import {
  AffiliateProductCreateRequestSchema,
  AffiliateProductIdSchema,
  AffiliateProductUpdateRequestSchema,
  AuthenticatedContextSchema,
  ConfigurationVersionRequestSchema,
  createUuidV7,
  hasPermission,
  type AuthenticatedContext,
  type Permission,
  type RequestId,
} from "@otshop/shared";

import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import {
  decodeConfigurationCursor,
  encodeConfigurationCursor,
  parseConfigurationPageSize,
} from "@/application/configuration/configuration-pagination";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import {
  AffiliateProductArchivedError,
  AffiliateProductConflictError,
  AffiliateProductNotFoundError,
  AffiliateProductPersistenceFailureError,
  InvalidAffiliateProductPaginationError,
  InvalidAffiliateProductReferenceError,
} from "./affiliate-product-errors";
import type {
  AffiliateProductMutationState,
  AffiliateProductRecord,
  AffiliateProductRepositoryPort,
} from "./affiliate-product-repository";

const cursorSchema = z
  .object({ createdAt: z.iso.datetime(), id: AffiliateProductIdSchema })
  .strict();
const publicProduct = (product: AffiliateProductRecord) => ({
  productId: product.id,
  accountId: product.accountId,
  displayName: product.displayName,
  productUrl: product.productUrl,
  productIdentifier: product.productIdentifier,
  status: product.status,
  version: product.version,
  account: product.account,
  createdAt: product.createdAt.toISOString(),
  updatedAt: product.updatedAt.toISOString(),
});

export class AffiliateProductService {
  constructor(
    private readonly repository: AffiliateProductRepositoryPort,
    private readonly log: ApplicationLogger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private authorize(context: AuthenticatedContext, permission: Permission) {
    const canonical = AuthenticatedContextSchema.parse(context);
    if (!hasPermission(canonical.role, permission) || !canonical.permissions.includes(permission))
      throw new AuthorizationDeniedError();
    return canonical;
  }

  private failure(state: AffiliateProductMutationState): never {
    if (state === "NOT_FOUND") throw new AffiliateProductNotFoundError();
    if (state === "ARCHIVED") throw new AffiliateProductArchivedError();
    if (state === "INVALID_ACCOUNT" || state === "INVALID_REFERENCE")
      throw new InvalidAffiliateProductReferenceError();
    throw new AffiliateProductConflictError();
  }

  private completed(
    requestId: RequestId,
    workspaceId: string,
    productId: string,
    operation: string,
    startedAt: number,
  ) {
    this.log.info("affiliate-product.mutation.completed", {
      requestId,
      workspaceId,
      productId,
      operation,
      result: "SUCCESS",
      durationMs: Math.round(performance.now() - startedAt),
    });
  }

  async create(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "projects.write");
    const body = AffiliateProductCreateRequestSchema.parse(input.body);
    const productId = AffiliateProductIdSchema.parse(createUuidV7(this.clock().getTime()));
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.create({
        id: productId,
        workspaceId: context.workspaceId,
        accountId: body.accountId,
        displayName: body.displayName,
        productUrl: body.productUrl ?? null,
        productIdentifier: body.productIdentifier ?? null,
      });
    } catch {
      throw new AffiliateProductPersistenceFailureError();
    }
    if (result.state === "INVALID_ACCOUNT") throw new InvalidAffiliateProductReferenceError();
    if (result.state !== "CREATED") throw new AffiliateProductConflictError();
    this.completed(input.requestId, context.workspaceId, productId, "CREATE", startedAt);
    return publicProduct(result.product);
  }

  async list(input: {
    readonly context: AuthenticatedContext;
    readonly limit?: string;
    readonly cursor?: string;
    readonly includeArchived?: string;
  }) {
    const context = this.authorize(input.context, "projects.read");
    if (input.includeArchived !== undefined && !["true", "false"].includes(input.includeArchived))
      throw new InvalidAffiliateProductPaginationError();
    const limit = parseConfigurationPageSize(
      input.limit,
      () => new InvalidAffiliateProductPaginationError(),
    );
    const before = decodeConfigurationCursor(
      input.cursor,
      cursorSchema,
      () => new InvalidAffiliateProductPaginationError(),
    );
    let page;
    try {
      page = await this.repository.list({
        workspaceId: context.workspaceId,
        includeArchived: input.includeArchived === "true",
        limit,
        ...(before === undefined
          ? {}
          : { before: { createdAt: new Date(before.createdAt), id: before.id } }),
      });
    } catch {
      throw new AffiliateProductPersistenceFailureError();
    }
    const last = page.products.at(-1);
    return {
      products: page.products.map(publicProduct),
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeConfigurationCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  async get(input: { readonly context: AuthenticatedContext; readonly productId: string }) {
    const context = this.authorize(input.context, "projects.read");
    const productId = AffiliateProductIdSchema.safeParse(input.productId);
    if (!productId.success) throw new AffiliateProductNotFoundError();
    let product;
    try {
      product = await this.repository.findByWorkspaceAndId(context.workspaceId, productId.data);
    } catch {
      throw new AffiliateProductPersistenceFailureError();
    }
    if (product === null) throw new AffiliateProductNotFoundError();
    return publicProduct(product);
  }

  async update(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly productId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "projects.write");
    const productId = AffiliateProductIdSchema.safeParse(input.productId);
    if (!productId.success) throw new AffiliateProductNotFoundError();
    const body = AffiliateProductUpdateRequestSchema.parse(input.body);
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.update({
        workspaceId: context.workspaceId,
        productId: productId.data,
        expectedVersion: body.expectedVersion,
        ...(body.accountId === undefined ? {} : { accountId: body.accountId }),
        ...(body.displayName === undefined ? {} : { displayName: body.displayName }),
        ...(Object.hasOwn(body, "productUrl") ? { productUrl: body.productUrl ?? null } : {}),
        ...(Object.hasOwn(body, "productIdentifier")
          ? { productIdentifier: body.productIdentifier ?? null }
          : {}),
      });
    } catch {
      throw new AffiliateProductPersistenceFailureError();
    }
    if (result.state !== "UPDATED") this.failure(result.state);
    this.completed(input.requestId, context.workspaceId, productId.data, "UPDATE", startedAt);
    return publicProduct(result.product);
  }

  async archive(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly productId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "projects.write");
    const productId = AffiliateProductIdSchema.safeParse(input.productId);
    if (!productId.success) throw new AffiliateProductNotFoundError();
    const body = ConfigurationVersionRequestSchema.parse(input.body);
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.archive({
        workspaceId: context.workspaceId,
        productId: productId.data,
        expectedVersion: body.expectedVersion,
      });
    } catch {
      throw new AffiliateProductPersistenceFailureError();
    }
    if (result.state !== "ARCHIVED" || !("product" in result)) this.failure(result.state);
    this.completed(input.requestId, context.workspaceId, productId.data, "ARCHIVE", startedAt);
    return publicProduct(result.product);
  }
}
