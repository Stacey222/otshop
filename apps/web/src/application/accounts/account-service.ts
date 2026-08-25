import { z } from "zod";

import {
  AuthenticatedContextSchema,
  ConfigurationVersionRequestSchema,
  ShopeeAccountCreateRequestSchema,
  ShopeeAccountIdSchema,
  ShopeeAccountUpdateRequestSchema,
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
  InvalidAccountPaginationError,
  ShopeeAccountArchivedError,
  ShopeeAccountConflictError,
  ShopeeAccountNotFoundError,
  ShopeeAccountPersistenceFailureError,
} from "./account-errors";
import type {
  AccountMutationState,
  ShopeeAccountRecord,
  ShopeeAccountRepositoryPort,
} from "./account-repository";

const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: ShopeeAccountIdSchema }).strict();
const publicAccount = (account: ShopeeAccountRecord) => ({
  accountId: account.id,
  displayName: account.displayName,
  accountHandle: account.accountHandle,
  countryCode: account.countryCode,
  status: account.status,
  version: account.version,
  createdAt: account.createdAt.toISOString(),
  updatedAt: account.updatedAt.toISOString(),
});

export class ShopeeAccountService {
  constructor(
    private readonly repository: ShopeeAccountRepositoryPort,
    private readonly log: ApplicationLogger,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private authorize(context: AuthenticatedContext, permission: Permission) {
    const canonical = AuthenticatedContextSchema.parse(context);
    if (!hasPermission(canonical.role, permission) || !canonical.permissions.includes(permission))
      throw new AuthorizationDeniedError();
    return canonical;
  }

  private failure(state: AccountMutationState): never {
    if (state === "NOT_FOUND") throw new ShopeeAccountNotFoundError();
    if (state === "ARCHIVED") throw new ShopeeAccountArchivedError();
    throw new ShopeeAccountConflictError();
  }

  private completed(
    requestId: RequestId,
    workspaceId: string,
    accountId: string,
    operation: string,
    startedAt: number,
  ) {
    this.log.info("shopee-account.mutation.completed", {
      requestId,
      workspaceId,
      accountId,
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
    const context = this.authorize(input.context, "accounts.manage");
    const body = ShopeeAccountCreateRequestSchema.parse(input.body);
    const accountId = ShopeeAccountIdSchema.parse(createUuidV7(this.clock().getTime()));
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.create({
        id: accountId,
        workspaceId: context.workspaceId,
        displayName: body.displayName,
        accountHandle: body.accountHandle ?? null,
        countryCode: body.countryCode,
      });
    } catch {
      throw new ShopeeAccountPersistenceFailureError();
    }
    if (result.state !== "CREATED") throw new ShopeeAccountConflictError();
    this.completed(input.requestId, context.workspaceId, accountId, "CREATE", startedAt);
    return publicAccount(result.account);
  }

  async list(input: {
    readonly context: AuthenticatedContext;
    readonly limit?: string;
    readonly cursor?: string;
    readonly includeArchived?: string;
  }) {
    const context = this.authorize(input.context, "accounts.read");
    if (input.includeArchived !== undefined && !["true", "false"].includes(input.includeArchived))
      throw new InvalidAccountPaginationError();
    const limit = parseConfigurationPageSize(
      input.limit,
      () => new InvalidAccountPaginationError(),
    );
    const before = decodeConfigurationCursor(
      input.cursor,
      cursorSchema,
      () => new InvalidAccountPaginationError(),
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
      throw new ShopeeAccountPersistenceFailureError();
    }
    const last = page.accounts.at(-1);
    return {
      accounts: page.accounts.map(publicAccount),
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeConfigurationCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  async get(input: { readonly context: AuthenticatedContext; readonly accountId: string }) {
    const context = this.authorize(input.context, "accounts.read");
    const accountId = ShopeeAccountIdSchema.safeParse(input.accountId);
    if (!accountId.success) throw new ShopeeAccountNotFoundError();
    let account;
    try {
      account = await this.repository.findByWorkspaceAndId(context.workspaceId, accountId.data);
    } catch {
      throw new ShopeeAccountPersistenceFailureError();
    }
    if (account === null) throw new ShopeeAccountNotFoundError();
    return publicAccount(account);
  }

  async update(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly accountId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "accounts.manage");
    const accountId = ShopeeAccountIdSchema.safeParse(input.accountId);
    if (!accountId.success) throw new ShopeeAccountNotFoundError();
    const body = ShopeeAccountUpdateRequestSchema.parse(input.body);
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.update({
        workspaceId: context.workspaceId,
        accountId: accountId.data,
        expectedVersion: body.expectedVersion,
        ...(body.displayName === undefined ? {} : { displayName: body.displayName }),
        ...(Object.hasOwn(body, "accountHandle")
          ? { accountHandle: body.accountHandle ?? null }
          : {}),
        ...(body.countryCode === undefined ? {} : { countryCode: body.countryCode }),
      });
    } catch {
      throw new ShopeeAccountPersistenceFailureError();
    }
    if (result.state !== "UPDATED") this.failure(result.state);
    this.completed(input.requestId, context.workspaceId, accountId.data, "UPDATE", startedAt);
    return publicAccount(result.account);
  }

  async archive(input: {
    readonly context: AuthenticatedContext;
    readonly requestId: RequestId;
    readonly accountId: string;
    readonly body: unknown;
  }) {
    const context = this.authorize(input.context, "accounts.manage");
    const accountId = ShopeeAccountIdSchema.safeParse(input.accountId);
    if (!accountId.success) throw new ShopeeAccountNotFoundError();
    const body = ConfigurationVersionRequestSchema.parse(input.body);
    const startedAt = performance.now();
    let result;
    try {
      result = await this.repository.archive({
        workspaceId: context.workspaceId,
        accountId: accountId.data,
        expectedVersion: body.expectedVersion,
      });
    } catch {
      throw new ShopeeAccountPersistenceFailureError();
    }
    if (result.state !== "ARCHIVED" || !("account" in result)) this.failure(result.state);
    this.completed(input.requestId, context.workspaceId, accountId.data, "ARCHIVE", startedAt);
    return publicAccount(result.account);
  }
}
