import { ROLE_PERMISSIONS, type AuthenticatedContext } from "@otshop/shared";
import { describe, expect, it, vi } from "vitest";

import { ShopeeAccountService } from "@/application/accounts/account-service";
import type { ShopeeAccountRepositoryPort } from "@/application/accounts/account-repository";
import { AuthorizationDeniedError } from "@/application/auth/auth-errors";
import { InvalidAccountPaginationError } from "@/application/accounts/account-errors";
import { InvalidAffiliateProductPaginationError } from "@/application/products/affiliate-product-errors";
import type { AffiliateProductRepositoryPort } from "@/application/products/affiliate-product-repository";
import { AffiliateProductService } from "@/application/products/affiliate-product-service";
import type { ApplicationLogger } from "@/infrastructure/logging/logger";

const workspaceId = "01941f29-7c00-7000-8000-000000000001";
const userId = "01941f29-7c00-7000-8000-000000000002";
const sessionId = "01941f29-7c00-7000-8000-000000000003";
const accountId = "01941f29-7c00-7000-8000-000000000004";
const productId = "01941f29-7c00-7000-8000-000000000005";
const requestId = "01941f29-7c00-7000-8000-000000000006";
const now = new Date("2026-08-25T16:00:00.000Z");
const context = (role: AuthenticatedContext["role"] = "ADMIN"): AuthenticatedContext => ({
  workspaceId,
  userId,
  sessionId,
  role,
  permissions: ROLE_PERMISSIONS[role],
});
const logger: ApplicationLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  withContext() {
    return this;
  },
};

const accountRecord = {
  id: accountId,
  workspaceId,
  displayName: "Local account",
  accountHandle: null,
  countryCode: "ID",
  status: "ACTIVE" as const,
  createdAt: now,
  updatedAt: now,
  version: 1,
};
const productRecord = {
  id: productId,
  workspaceId,
  accountId,
  displayName: "Local product",
  productUrl: "https://shopee.co.id/product/1",
  productIdentifier: null,
  status: "ACTIVE" as const,
  createdAt: now,
  updatedAt: now,
  version: 1,
  account: { id: accountId, displayName: "Local account", status: "ACTIVE" },
};

const accountRepository = (): ShopeeAccountRepositoryPort => ({
  create: vi.fn(async () => ({ state: "CREATED", account: accountRecord }) as const),
  findByWorkspaceAndId: vi.fn(async () => accountRecord),
  list: vi.fn(async () => ({ accounts: [accountRecord], hasMore: false })),
  update: vi.fn(async () => ({ state: "UPDATED", account: accountRecord }) as const),
  archive: vi.fn(
    async () =>
      ({ state: "ARCHIVED", account: { ...accountRecord, status: "ARCHIVED" as const } }) as const,
  ),
});
const productRepository = (): AffiliateProductRepositoryPort => ({
  create: vi.fn(async () => ({ state: "CREATED", product: productRecord }) as const),
  findByWorkspaceAndId: vi.fn(async () => productRecord),
  list: vi.fn(async () => ({ products: [productRecord], hasMore: false })),
  update: vi.fn(async () => ({ state: "UPDATED", product: productRecord }) as const),
  archive: vi.fn(
    async () =>
      ({ state: "ARCHIVED", product: { ...productRecord, status: "ARCHIVED" as const } }) as const,
  ),
});

describe("account and product service authorization", () => {
  it("allows canonical readers but requires account management for writes", async () => {
    const service = new ShopeeAccountService(accountRepository(), logger, () => now);
    await expect(service.get({ context: context("VIEWER"), accountId })).resolves.toMatchObject({
      accountId,
    });
    await expect(
      service.create({
        context: context("VIEWER"),
        requestId,
        body: { displayName: "Denied", countryCode: "ID" },
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("requires both canonical role permission and authenticated permission arrays", async () => {
    const account = new ShopeeAccountService(accountRepository(), logger, () => now);
    const product = new AffiliateProductService(productRepository(), logger, () => now);
    await expect(
      account.get({ context: { ...context(), permissions: [] }, accountId }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    await expect(
      product.get({ context: { ...context(), role: "UNKNOWN" as "ADMIN" }, productId }),
    ).rejects.toThrow();
  });

  it("allows canonical product readers/writers and validates pagination before repositories", async () => {
    const accountRepo = accountRepository();
    const productRepo = productRepository();
    const account = new ShopeeAccountService(accountRepo, logger, () => now);
    const product = new AffiliateProductService(productRepo, logger, () => now);
    await expect(product.get({ context: context("VIEWER"), productId })).resolves.toMatchObject({
      productId,
    });
    await expect(
      product.create({
        context: context("OPERATOR"),
        requestId,
        body: { accountId, displayName: "Configured", productIdentifier: "operator-1" },
      }),
    ).resolves.toMatchObject({ productId });
    await expect(account.list({ context: context(), limit: "101" })).rejects.toBeInstanceOf(
      InvalidAccountPaginationError,
    );
    await expect(product.list({ context: context(), cursor: "***" })).rejects.toBeInstanceOf(
      InvalidAffiliateProductPaginationError,
    );
    expect(accountRepo.list).not.toHaveBeenCalled();
    expect(productRepo.list).not.toHaveBeenCalled();
  });
});
