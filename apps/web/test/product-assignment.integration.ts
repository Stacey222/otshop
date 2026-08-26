import {
  AffiliateProductRepository,
  DatasetRepository,
  ProjectItemProductRepository,
  ProjectItemRepository,
  ProjectRepository,
  getDatabaseClient,
} from "@otshop/database";
import { ROLE_PERMISSIONS, createUuidV7, type AuthenticatedContext } from "@otshop/shared";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PUT as assignmentRoute } from "../src/app/api/projects/[projectId]/items/[projectItemId]/product/route";
import { AffiliateProductService } from "../src/application/products/affiliate-product-service";
import { ProjectItemProductService } from "../src/application/projects/project-item-product-service";
import { ProjectItemService } from "../src/application/projects/project-item-service";
import { ProjectService } from "../src/application/projects/project-service";
import type { ApplicationLogger } from "../src/infrastructure/logging/logger";

const prisma = getDatabaseClient();
const clock = () => new Date("2026-08-26T03:00:00.000Z");
let sequence = 0;
const id = () => createUuidV7(clock().getTime() + sequence++);
const requestId = id();
const tenantA = { userId: id(), organizationId: id(), workspaceId: id(), sessionId: id() };
const tenantB = { userId: id(), organizationId: id(), workspaceId: id(), sessionId: id() };
const accountA = id();
const accountA2 = id();
const accountB = id();
const productX = id();
const productY = id();
const productMismatch = id();
const productForeign = id();
const productArchived = id();

const logger: ApplicationLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  withContext() {
    return this;
  },
};
const projectService = new ProjectService(new ProjectRepository(prisma), logger, clock);
const materializationService = new ProjectItemService(
  new ProjectItemRepository(prisma, clock),
  logger,
);
const assignmentService = new ProjectItemProductService(
  new ProjectItemProductRepository(prisma),
  logger,
);
const productService = new AffiliateProductService(
  new AffiliateProductRepository(prisma),
  logger,
  clock,
);
const datasetRepository = new DatasetRepository(prisma);

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
      email: `assignment-${suffix}@example.test`,
      displayName: suffix,
      status: "ACTIVE",
    },
  });
  await prisma.organization.create({
    data: {
      id: tenant.organizationId,
      name: suffix,
      slug: `assignment-${suffix}`,
      status: "ACTIVE",
    },
  });
  await prisma.workspace.create({
    data: {
      id: tenant.workspaceId,
      organizationId: tenant.organizationId,
      name: suffix,
      slug: `assignment-${suffix}`,
      timezone: "Asia/Jakarta",
      status: "ACTIVE",
    },
  });
}

beforeAll(async () => {
  await seedTenant(tenantA, `a-${tenantA.workspaceId.slice(-6)}`);
  await seedTenant(tenantB, `b-${tenantB.workspaceId.slice(-6)}`);
  await prisma.shopeeAccount.createMany({
    data: [
      {
        id: accountA,
        workspaceId: tenantA.workspaceId,
        displayName: "Account A",
        countryCode: "ID",
        status: "ACTIVE",
      },
      {
        id: accountA2,
        workspaceId: tenantA.workspaceId,
        displayName: "Account A2",
        countryCode: "ID",
        status: "ACTIVE",
      },
      {
        id: accountB,
        workspaceId: tenantB.workspaceId,
        displayName: "Account B",
        countryCode: "ID",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.productReference.createMany({
    data: [
      {
        id: productX,
        workspaceId: tenantA.workspaceId,
        accountId: accountA,
        displayName: "Product X",
        operatorReference: "x",
        source: "MANUAL",
        status: "ACTIVE",
      },
      {
        id: productY,
        workspaceId: tenantA.workspaceId,
        accountId: accountA,
        displayName: "Product Y",
        operatorReference: "y",
        source: "MANUAL",
        status: "ACTIVE",
      },
      {
        id: productMismatch,
        workspaceId: tenantA.workspaceId,
        accountId: accountA2,
        displayName: "Product mismatch",
        operatorReference: "mismatch",
        source: "MANUAL",
        status: "ACTIVE",
      },
      {
        id: productForeign,
        workspaceId: tenantB.workspaceId,
        accountId: accountB,
        displayName: "Product foreign",
        operatorReference: "foreign",
        source: "MANUAL",
        status: "ACTIVE",
      },
      {
        id: productArchived,
        workspaceId: tenantA.workspaceId,
        accountId: accountA,
        displayName: "Product archived",
        operatorReference: "archived",
        source: "MANUAL",
        status: "ARCHIVED",
      },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function fixture(name: string, itemCount = 2, accountId: string | null = accountA) {
  const datasetId = id();
  await prisma.dataset.create({
    data: {
      id: datasetId,
      workspaceId: tenantA.workspaceId,
      createdByUserId: tenantA.userId,
      name,
      status: "ACTIVE",
    },
  });
  const sources: { id: string; mediaAssetId: string; position: number }[] = [];
  for (let position = 0; position < itemCount; position += 1) {
    const mediaAssetId = id();
    await prisma.mediaAsset.create({
      data: {
        id: mediaAssetId,
        workspaceId: tenantA.workspaceId,
        source: "MANUAL_UPLOAD",
        originalFilename: `${name}-${position}.mp4`,
        storageKey: `assignment/${tenantA.workspaceId}/${mediaAssetId}.mp4`,
        mimeType: "video/mp4",
        sizeBytes: 100n,
        sha256: Buffer.from(mediaAssetId.replaceAll("-", "").slice(0, 64).padEnd(64, "0"), "hex"),
        status: "READY",
        durationMs: 1_000n,
        width: 1080,
        height: 1920,
        fps: 30,
        bitrateBps: 1_000_000n,
        codec: "h264",
        audioCodec: "aac",
        orientation: "ROTATION_0",
      },
    });
    sources.push({ id: id(), mediaAssetId, position });
  }
  await prisma.datasetItem.createMany({
    data: sources.map((source) => ({ ...source, workspaceId: tenantA.workspaceId, datasetId })),
  });
  const project = await projectService.create({
    context: context(),
    requestId,
    body: { name: `${name} project`, datasetId, accountId, dailyTarget: 5 },
  });
  const materialized = await materializationService.materialize({
    context: context(),
    requestId,
    projectId: project.projectId,
    body: { expectedVersion: project.version },
  });
  const items = await prisma.projectItem.findMany({
    where: { projectId: project.projectId },
    orderBy: { position: "asc" },
  });
  return { datasetId, sources, project, materialized, items };
}

const assign = (
  fixtureValue: Awaited<ReturnType<typeof fixture>>,
  itemIndex: number,
  productId: string,
  expectedVersion: number,
) =>
  assignmentService.assign({
    context: context(),
    requestId,
    projectId: fixtureValue.project.projectId,
    projectItemId: fixtureValue.items[itemIndex]!.id,
    body: { productId, expectedVersion },
  });

describe("database-backed ProjectItem affiliate product assignment", () => {
  it("rejects unauthenticated route access and cross-workspace item/product identifiers", async () => {
    const value = await fixture("Assignment authorization", 1);
    const response = await assignmentRoute(
      new NextRequest(
        `http://localhost:3000/api/projects/${value.project.projectId}/items/${value.items[0]!.id}/product`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
          body: JSON.stringify({
            productId: productX,
            expectedVersion: value.materialized.projectVersion,
          }),
        },
      ),
      {
        params: Promise.resolve({
          projectId: value.project.projectId,
          projectItemId: value.items[0]!.id,
        }),
      },
    );
    expect(response.status).toBe(401);
    await expect(
      assignmentService.assign({
        context: context(tenantB),
        requestId,
        projectId: value.project.projectId,
        projectItemId: value.items[0]!.id,
        body: { productId: productForeign, expectedVersion: value.materialized.projectVersion },
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    await expect(
      assign(value, 0, productForeign, value.materialized.projectVersion),
    ).rejects.toMatchObject({
      code: "PRODUCT_NOT_FOUND",
    });
  });

  it("assigns idempotently, replaces atomically, reads safely, and removes without deleting roots", async () => {
    const value = await fixture("Assignment lifecycle", 1);
    const first = await assign(value, 0, productX, value.materialized.projectVersion);
    expect(first).toMatchObject({ changed: true, assignment: { productId: productX } });
    const repeat = await assign(value, 0, productX, first.projectVersion);
    expect(repeat).toMatchObject({ changed: false, projectVersion: first.projectVersion });
    const replaced = await assign(value, 0, productY, repeat.projectVersion);
    expect(replaced).toMatchObject({ changed: true, assignment: { productId: productY } });
    expect(
      await assignmentService.get({
        context: context(),
        projectId: value.project.projectId,
        projectItemId: value.items[0]!.id,
      }),
    ).toMatchObject({ assignment: { productId: productY, displayName: "Product Y" } });
    const removed = await assignmentService.remove({
      context: context(),
      requestId,
      projectId: value.project.projectId,
      projectItemId: value.items[0]!.id,
      body: { expectedVersion: replaced.projectVersion },
    });
    expect(removed).toMatchObject({ changed: true, assignment: null });
    expect(await prisma.projectItem.count({ where: { id: value.items[0]!.id } })).toBe(1);
    expect(await prisma.productReference.count({ where: { id: productY } })).toBe(1);
  });

  it("rejects archived, account-mismatched, accountless, and archived-item assignment", async () => {
    const value = await fixture("Assignment eligibility", 1);
    await expect(
      assign(value, 0, productArchived, value.materialized.projectVersion),
    ).rejects.toMatchObject({ code: "PRODUCT_ARCHIVED" });
    await expect(
      assign(value, 0, productMismatch, value.materialized.projectVersion),
    ).rejects.toMatchObject({ code: "PRODUCT_ACCOUNT_MISMATCH" });
    const accountless = await fixture("Assignment accountless", 1, null);
    await expect(
      assign(accountless, 0, productX, accountless.materialized.projectVersion),
    ).rejects.toMatchObject({ code: "PRODUCT_ACCOUNT_MISMATCH" });
    await prisma.projectItem.update({
      where: { id: value.items[0]!.id },
      data: { status: "ARCHIVED" },
    });
    await expect(
      assign(value, 0, productX, value.materialized.projectVersion),
    ).rejects.toMatchObject({ code: "PROJECT_ITEM_ARCHIVED" });
  });

  it("bulk-applies one product to all active materialized items deterministically", async () => {
    const value = await fixture("Assignment bulk", 3);
    const bulk = await assignmentService.assignAll({
      context: context(),
      requestId,
      projectId: value.project.projectId,
      body: { productId: productX, expectedVersion: value.materialized.projectVersion },
    });
    expect(bulk).toMatchObject({ changed: true, itemCount: 3, changedCount: 3 });
    const repeat = await assignmentService.assignAll({
      context: context(),
      requestId,
      projectId: value.project.projectId,
      body: { productId: productX, expectedVersion: bulk.projectVersion },
    });
    expect(repeat).toMatchObject({
      changed: false,
      changedCount: 0,
      projectVersion: bulk.projectVersion,
    });
    expect(
      await prisma.projectItemProduct.count({
        where: { projectItem: { projectId: value.project.projectId } },
      }),
    ).toBe(3);
  });

  it("keeps assignment identity through Dataset reorder and blocks configured removal", async () => {
    const value = await fixture("Assignment reconciliation", 2);
    let version = value.materialized.projectVersion;
    const first = await assign(value, 0, productX, version);
    version = first.projectVersion;
    const second = await assign(value, 1, productY, version);
    const reversed = [...value.sources].reverse().map(({ id: sourceId }) => sourceId);
    await datasetRepository.reorder({
      workspaceId: tenantA.workspaceId,
      datasetId: value.datasetId,
      itemIds: reversed,
      expectedVersion: 1,
    });
    const reconciliation = await materializationService.materialize({
      context: context(),
      requestId,
      projectId: value.project.projectId,
      body: { expectedVersion: second.projectVersion },
    });
    expect(reconciliation.reorderedCount).toBe(2);
    const persisted = await prisma.projectItem.findMany({
      where: { projectId: value.project.projectId },
      include: { products: true },
    });
    expect(
      persisted.find(({ id: itemId }) => itemId === value.items[0]!.id)?.products[0]
        ?.productReferenceId,
    ).toBe(productX);
    expect(
      persisted.find(({ id: itemId }) => itemId === value.items[1]!.id)?.products[0]
        ?.productReferenceId,
    ).toBe(productY);
    await expect(
      datasetRepository.removeItem({
        workspaceId: tenantA.workspaceId,
        datasetId: value.datasetId,
        itemId: value.sources[0]!.id,
        expectedVersion: 2,
      }),
    ).resolves.toEqual({ state: "PROJECT_ITEM_CONFLICT" });
  });

  it("allows one project-version winner for assign/assign and assign/remove races", async () => {
    const assignRace = await fixture("Assignment race", 1);
    const outcomes = await Promise.allSettled([
      assign(assignRace, 0, productX, assignRace.materialized.projectVersion),
      assign(assignRace, 0, productY, assignRace.materialized.projectVersion),
    ]);
    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.projectItemProduct.count({ where: { projectItemId: assignRace.items[0]!.id } }),
    ).toBe(1);

    const mixedRace = await fixture("Assignment removal race", 1);
    const assigned = await assign(mixedRace, 0, productX, mixedRace.materialized.projectVersion);
    const mixed = await Promise.allSettled([
      assign(mixedRace, 0, productY, assigned.projectVersion),
      assignmentService.remove({
        context: context(),
        requestId,
        projectId: mixedRace.project.projectId,
        projectItemId: mixedRace.items[0]!.id,
        body: { expectedVersion: assigned.projectVersion },
      }),
    ]);
    expect(mixed.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.projectItemProduct.count({ where: { projectItemId: mixedRace.items[0]!.id } }),
    ).toBeLessThanOrEqual(1);
  });

  it("keeps product archive/assignment and Project account/assignment races safe", async () => {
    const archiveRace = await fixture("Assignment product archive race", 1);
    const raceProductId = id();
    await prisma.productReference.create({
      data: {
        id: raceProductId,
        workspaceId: tenantA.workspaceId,
        accountId: accountA,
        displayName: "Race product",
        operatorReference: `race-${raceProductId}`,
        source: "MANUAL",
        status: "ACTIVE",
      },
    });
    await Promise.allSettled([
      assign(archiveRace, 0, raceProductId, archiveRace.materialized.projectVersion),
      productService.archive({
        context: context(),
        requestId,
        productId: raceProductId,
        body: { expectedVersion: 1 },
      }),
    ]);
    const archivedProduct = await prisma.productReference.findUniqueOrThrow({
      where: { id: raceProductId },
    });
    const archiveRaceAssignment = await prisma.projectItemProduct.findFirst({
      where: { projectItemId: archiveRace.items[0]!.id },
    });
    expect(archivedProduct.status).toBe("ARCHIVED");
    if (archiveRaceAssignment !== null) {
      await expect(
        assignmentService.get({
          context: context(),
          projectId: archiveRace.project.projectId,
          projectItemId: archiveRace.items[0]!.id,
        }),
      ).resolves.toMatchObject({ assignment: { productId: raceProductId, status: "ARCHIVED" } });
      await expect(
        projectService.markReady({
          context: context(),
          requestId,
          projectId: archiveRace.project.projectId,
          body: { expectedVersion: archiveRace.materialized.projectVersion + 1 },
        }),
      ).rejects.toMatchObject({ code: "PROJECT_NOT_CONFIGURABLE" });
    }

    const accountRace = await fixture("Assignment Project account race", 1);
    const accountOutcomes = await Promise.allSettled([
      assign(accountRace, 0, productY, accountRace.materialized.projectVersion),
      projectService.update({
        context: context(),
        requestId,
        projectId: accountRace.project.projectId,
        body: { expectedVersion: accountRace.materialized.projectVersion, accountId: accountA2 },
      }),
    ]);
    expect(accountOutcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const accountRaceProject = await prisma.project.findUniqueOrThrow({
      where: { id: accountRace.project.projectId },
    });
    const accountRaceAssignment = await prisma.projectItemProduct.findFirst({
      where: { projectItemId: accountRace.items[0]!.id },
      include: { productReference: true },
    });
    expect(
      accountRaceAssignment === null ||
        accountRaceAssignment.productReference.accountId === accountRaceProject.accountId,
    ).toBe(true);
  });

  it("prevents account mutation from invalidating assignments and READY rejects archived products", async () => {
    const value = await fixture("Assignment invariants", 1);
    const assigned = await assign(value, 0, productX, value.materialized.projectVersion);
    await expect(
      projectService.update({
        context: context(),
        requestId,
        projectId: value.project.projectId,
        body: { expectedVersion: assigned.projectVersion, accountId: accountA2 },
      }),
    ).rejects.toMatchObject({ code: "PROJECT_INVALID_ACCOUNT" });
    await expect(
      productService.update({
        context: context(),
        requestId,
        productId: productX,
        body: { expectedVersion: 1, accountId: accountA2 },
      }),
    ).rejects.toMatchObject({ code: "INVALID_AFFILIATE_PRODUCT_REFERENCE" });
    await prisma.productReference.update({ where: { id: productX }, data: { status: "ARCHIVED" } });
    await expect(
      projectService.markReady({
        context: context(),
        requestId,
        projectId: value.project.projectId,
        body: { expectedVersion: assigned.projectVersion },
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_CONFIGURABLE" });
    await expect(
      assignmentService.get({
        context: context(),
        projectId: value.project.projectId,
        projectItemId: value.items[0]!.id,
      }),
    ).resolves.toMatchObject({ assignment: { productId: productX, status: "ARCHIVED" } });
    await prisma.productReference.update({ where: { id: productX }, data: { status: "ACTIVE" } });
  });

  it("enforces one primary position-zero assignment in PostgreSQL and creates no execution work", async () => {
    const value = await fixture("Assignment constraints", 1);
    await assign(value, 0, productX, value.materialized.projectVersion);
    await expect(
      prisma.projectItemProduct.create({
        data: {
          workspaceId: tenantA.workspaceId,
          projectItemId: value.items[0]!.id,
          productReferenceId: productY,
          position: 0,
        },
      }),
    ).rejects.toThrow();
    await prisma.projectItemProduct.deleteMany({ where: { projectItemId: value.items[0]!.id } });
    await expect(
      prisma.projectItemProduct.create({
        data: {
          workspaceId: tenantA.workspaceId,
          projectItemId: value.items[0]!.id,
          productReferenceId: productY,
          position: 1,
        },
      }),
    ).rejects.toThrow();
    expect(await prisma.publishJob.count({ where: { projectId: value.project.projectId } })).toBe(
      0,
    );
    expect(await prisma.scheduleRun.count()).toBe(0);
  });
});
