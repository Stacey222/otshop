import {
  AffiliateProductRepository,
  ProjectRepository,
  ShopeeAccountRepository,
  getDatabaseClient,
} from "@otshop/database";
import { ROLE_PERMISSIONS, createUuidV7, type AuthenticatedContext } from "@otshop/shared";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ShopeeAccountService } from "../src/application/accounts/account-service";
import { AffiliateProductService } from "../src/application/products/affiliate-product-service";
import { ProjectService } from "../src/application/projects/project-service";
import type { ApplicationLogger } from "../src/infrastructure/logging/logger";
import { POST as affiliateProductCreateRoute } from "../src/app/api/affiliate-products/route";
import { POST as shopeeAccountCreateRoute } from "../src/app/api/shopee-accounts/route";

const prisma = getDatabaseClient();
const clock = () => new Date("2026-08-25T16:00:00.000Z");
let sequence = 0;
const id = () => createUuidV7(clock().getTime() + sequence++);
const requestId = id();
const tenantA = { userId: id(), organizationId: id(), workspaceId: id(), sessionId: id() };
const tenantB = { userId: id(), organizationId: id(), workspaceId: id(), sessionId: id() };
const datasetId = id();

const logger: ApplicationLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  withContext() {
    return this;
  },
};

const accountService = new ShopeeAccountService(new ShopeeAccountRepository(prisma), logger, clock);
const productService = new AffiliateProductService(
  new AffiliateProductRepository(prisma),
  logger,
  clock,
);
const projectService = new ProjectService(new ProjectRepository(prisma), logger, clock);
const context = (tenant = tenantA): AuthenticatedContext => ({
  userId: tenant.userId,
  sessionId: tenant.sessionId,
  workspaceId: tenant.workspaceId,
  role: "ADMIN",
  permissions: ROLE_PERMISSIONS.ADMIN,
});

async function seedTenant(tenant: typeof tenantA, suffix: string) {
  await prisma.user.create({
    data: {
      id: tenant.userId,
      email: `account-product-${suffix}@example.test`,
      displayName: suffix,
      status: "ACTIVE",
    },
  });
  await prisma.organization.create({
    data: {
      id: tenant.organizationId,
      name: suffix,
      slug: `account-product-${suffix}`,
      status: "ACTIVE",
    },
  });
  await prisma.workspace.create({
    data: {
      id: tenant.workspaceId,
      organizationId: tenant.organizationId,
      name: suffix,
      slug: `account-product-${suffix}`,
      timezone: "Asia/Jakarta",
      status: "ACTIVE",
    },
  });
}

beforeAll(async () => {
  await seedTenant(tenantA, `a-${tenantA.workspaceId.slice(-6)}`);
  await seedTenant(tenantB, `b-${tenantB.workspaceId.slice(-6)}`);
  await prisma.dataset.create({
    data: {
      id: datasetId,
      workspaceId: tenantA.workspaceId,
      createdByUserId: tenantA.userId,
      name: "Account relation dataset",
      status: "ACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const createAccount = (displayName: string, tenant = tenantA) =>
  accountService.create({
    context: context(tenant),
    requestId,
    body: {
      displayName,
      accountHandle: `@${displayName.toLowerCase().replaceAll(" ", "-")}`,
      countryCode: "ID",
    },
  });

const createProduct = (displayName: string, accountId: string, tenant = tenantA) =>
  productService.create({
    context: context(tenant),
    requestId,
    body: {
      accountId,
      displayName,
      productUrl: `https://shopee.co.id/${encodeURIComponent(displayName)}`,
    },
  });

describe("database-backed account and affiliate product configuration", () => {
  it("rejects unauthenticated account and product mutations", async () => {
    const headers = { "Content-Type": "application/json", Origin: "http://localhost:3000" };
    const accountResponse = await shopeeAccountCreateRoute(
      new NextRequest("http://localhost:3000/api/shopee-accounts", {
        method: "POST",
        headers,
        body: JSON.stringify({ displayName: "Unauthorized account", countryCode: "ID" }),
      }),
    );
    const productResponse = await affiliateProductCreateRoute(
      new NextRequest("http://localhost:3000/api/affiliate-products", {
        method: "POST",
        headers,
        body: JSON.stringify({
          accountId: id(),
          displayName: "Unauthorized product",
          productIdentifier: "local",
        }),
      }),
    );
    expect(accountResponse.status).toBe(401);
    expect(productResponse.status).toBe(401);
  });

  it("creates, reads, lists, updates, and archives a credential-free local account", async () => {
    let account = await createAccount("Lifecycle account");
    expect(account).toMatchObject({ status: "ACTIVE", countryCode: "ID", version: 1 });
    expect(account).not.toHaveProperty("password");
    expect(account).not.toHaveProperty("cookie");
    expect(
      (await accountService.get({ context: context(), accountId: account.accountId })).accountId,
    ).toBe(account.accountId);
    expect(
      (await accountService.list({ context: context(), limit: "100" })).accounts.some(
        ({ accountId }) => accountId === account.accountId,
      ),
    ).toBe(true);
    account = await accountService.update({
      context: context(),
      requestId,
      accountId: account.accountId,
      body: { expectedVersion: account.version, displayName: "Lifecycle account updated" },
    });
    await expect(
      accountService.update({
        context: context(),
        requestId,
        accountId: account.accountId,
        body: { expectedVersion: 1, displayName: "Stale account" },
      }),
    ).rejects.toMatchObject({ code: "SHOPEE_ACCOUNT_CONFLICT" });
    account = await accountService.archive({
      context: context(),
      requestId,
      accountId: account.accountId,
      body: { expectedVersion: account.version },
    });
    expect(account.status).toBe("ARCHIVED");
    await expect(
      accountService.update({
        context: context(),
        requestId,
        accountId: account.accountId,
        body: { expectedVersion: account.version, displayName: "Forbidden" },
      }),
    ).rejects.toMatchObject({ code: "SHOPEE_ACCOUNT_ARCHIVED" });
  });

  it("fails closed for cross-workspace account reads and writes", async () => {
    const account = await createAccount("Tenant account");
    await expect(
      accountService.get({ context: context(tenantB), accountId: account.accountId }),
    ).rejects.toMatchObject({ code: "SHOPEE_ACCOUNT_NOT_FOUND" });
    await expect(
      accountService.update({
        context: context(tenantB),
        requestId,
        accountId: account.accountId,
        body: { expectedVersion: account.version, displayName: "Escape" },
      }),
    ).rejects.toMatchObject({ code: "SHOPEE_ACCOUNT_NOT_FOUND" });
    await expect(
      accountService.archive({
        context: context(tenantB),
        requestId,
        accountId: account.accountId,
        body: { expectedVersion: account.version },
      }),
    ).rejects.toMatchObject({ code: "SHOPEE_ACCOUNT_NOT_FOUND" });
  });

  it("creates, updates, lists, and archives an unverified local affiliate product", async () => {
    const account = await createAccount("Product lifecycle account");
    let product = await createProduct("Lifecycle product", account.accountId);
    expect(product).toMatchObject({ status: "ACTIVE", accountId: account.accountId, version: 1 });
    product = await productService.update({
      context: context(),
      requestId,
      productId: product.productId,
      body: { expectedVersion: product.version, productIdentifier: "operator-product-1" },
    });
    await expect(
      productService.update({
        context: context(),
        requestId,
        productId: product.productId,
        body: { expectedVersion: 1, displayName: "Stale product" },
      }),
    ).rejects.toMatchObject({ code: "AFFILIATE_PRODUCT_CONFLICT" });
    expect(
      (await productService.list({ context: context(), limit: "100" })).products.some(
        ({ productId }) => productId === product.productId,
      ),
    ).toBe(true);
    product = await productService.archive({
      context: context(),
      requestId,
      productId: product.productId,
      body: { expectedVersion: product.version },
    });
    await expect(
      productService.update({
        context: context(),
        requestId,
        productId: product.productId,
        body: { expectedVersion: product.version, displayName: "Forbidden" },
      }),
    ).rejects.toMatchObject({ code: "AFFILIATE_PRODUCT_ARCHIVED" });
  });

  it("fails closed for cross-workspace product reads and writes", async () => {
    const account = await createAccount("Product tenant account");
    const product = await createProduct("Tenant product", account.accountId);
    await expect(
      productService.get({ context: context(tenantB), productId: product.productId }),
    ).rejects.toMatchObject({ code: "AFFILIATE_PRODUCT_NOT_FOUND" });
    await expect(
      productService.update({
        context: context(tenantB),
        requestId,
        productId: product.productId,
        body: { expectedVersion: product.version, displayName: "Escape" },
      }),
    ).rejects.toMatchObject({ code: "AFFILIATE_PRODUCT_NOT_FOUND" });
    await expect(
      productService.archive({
        context: context(tenantB),
        requestId,
        productId: product.productId,
        body: { expectedVersion: product.version },
      }),
    ).rejects.toMatchObject({ code: "AFFILIATE_PRODUCT_NOT_FOUND" });
  });

  it("rejects archived and cross-workspace accounts for products and Projects", async () => {
    const local = await createAccount("Relation local account");
    const foreign = await createAccount("Relation foreign account", tenantB);
    await expect(createProduct("Foreign product", foreign.accountId)).rejects.toMatchObject({
      code: "INVALID_AFFILIATE_PRODUCT_REFERENCE",
    });
    const project = await projectService.create({
      context: context(),
      requestId,
      body: { name: "Active account project", datasetId, accountId: local.accountId },
    });
    expect(project.accountId).toBe(local.accountId);
    const archived = await accountService.archive({
      context: context(),
      requestId,
      accountId: local.accountId,
      body: { expectedVersion: local.version },
    });
    expect(
      (await projectService.get({ context: context(), projectId: project.projectId })).accountId,
    ).toBe(archived.accountId);
    await expect(
      projectService.create({
        context: context(),
        requestId,
        body: { name: "Archived account project", datasetId, accountId: archived.accountId },
      }),
    ).rejects.toMatchObject({ code: "PROJECT_INVALID_ACCOUNT" });
    await expect(
      projectService.create({
        context: context(),
        requestId,
        body: { name: "Foreign account project", datasetId, accountId: foreign.accountId },
      }),
    ).rejects.toMatchObject({ code: "PROJECT_INVALID_ACCOUNT" });
    const unlinked = await projectService.create({
      context: context(),
      requestId,
      body: { name: "Unlinked account project", datasetId },
    });
    await expect(
      projectService.update({
        context: context(),
        requestId,
        projectId: unlinked.projectId,
        body: { expectedVersion: unlinked.version, accountId: archived.accountId },
      }),
    ).rejects.toMatchObject({ code: "PROJECT_INVALID_ACCOUNT" });
  });

  it("uses stable bounded keyset pages for accounts and products", async () => {
    const accountA = await createAccount("Pagination account A");
    await createAccount("Pagination account B");
    await createAccount("Pagination account C");
    await createProduct("Pagination product A", accountA.accountId);
    await createProduct("Pagination product B", accountA.accountId);
    await createProduct("Pagination product C", accountA.accountId);
    const accountPage = await accountService.list({ context: context(), limit: "2" });
    const nextAccounts = await accountService.list({
      context: context(),
      limit: "2",
      cursor: accountPage.nextCursor!,
    });
    expect(
      nextAccounts.accounts.some(({ accountId }) =>
        accountPage.accounts.some((first) => first.accountId === accountId),
      ),
    ).toBe(false);
    const productPage = await productService.list({ context: context(), limit: "2" });
    const nextProducts = await productService.list({
      context: context(),
      limit: "2",
      cursor: productPage.nextCursor!,
    });
    expect(
      nextProducts.products.some(({ productId }) =>
        productPage.products.some((first) => first.productId === productId),
      ),
    ).toBe(false);
  });

  it("enforces account and product lifecycle/reference constraints in PostgreSQL", async () => {
    const account = await createAccount("Constraint account");
    const product = await createProduct("Constraint product", account.accountId);
    await expect(
      prisma.shopeeAccount.update({
        where: { id: account.accountId },
        data: { status: "CONNECTED" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.productReference.update({
        where: { id: product.productId },
        data: { status: "UNKNOWN" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.productReference.update({
        where: { id: product.productId },
        data: { productUrl: null, operatorReference: null },
      }),
    ).rejects.toThrow();
  });

  it("allows one winner for same-version account updates and update/archive races", async () => {
    const updateRace = await createAccount("Account update race");
    const updates = await Promise.allSettled([
      accountService.update({
        context: context(),
        requestId,
        accountId: updateRace.accountId,
        body: { expectedVersion: 1, displayName: "Account update winner A" },
      }),
      accountService.update({
        context: context(),
        requestId,
        accountId: updateRace.accountId,
        body: { expectedVersion: 1, displayName: "Account update winner B" },
      }),
    ]);
    expect(updates.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const archiveRace = await createAccount("Account archive race");
    const mixed = await Promise.allSettled([
      accountService.update({
        context: context(),
        requestId,
        accountId: archiveRace.accountId,
        body: { expectedVersion: 1, displayName: "Account mixed winner" },
      }),
      accountService.archive({
        context: context(),
        requestId,
        accountId: archiveRace.accountId,
        body: { expectedVersion: 1 },
      }),
    ]);
    expect(mixed.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  });

  it("allows one winner for same-version product updates and update/archive races", async () => {
    const account = await createAccount("Product race account");
    const updateRace = await createProduct("Product update race", account.accountId);
    const updates = await Promise.allSettled([
      productService.update({
        context: context(),
        requestId,
        productId: updateRace.productId,
        body: { expectedVersion: 1, displayName: "Product update winner A" },
      }),
      productService.update({
        context: context(),
        requestId,
        productId: updateRace.productId,
        body: { expectedVersion: 1, displayName: "Product update winner B" },
      }),
    ]);
    expect(updates.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const archiveRace = await createProduct("Product archive race", account.accountId);
    const mixed = await Promise.allSettled([
      productService.update({
        context: context(),
        requestId,
        productId: archiveRace.productId,
        body: { expectedVersion: 1, displayName: "Product mixed winner" },
      }),
      productService.archive({
        context: context(),
        requestId,
        productId: archiveRace.productId,
        body: { expectedVersion: 1 },
      }),
    ]);
    expect(mixed.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  });
});
