import { Prisma, PrismaClient, type Prisma as PrismaNamespace } from "@prisma/client";
import { ROLE_PERMISSIONS, UserIdSchema, publishJobStates, roles } from "@otshop/shared";
import { afterAll, describe, expect, it } from "vitest";

type Transaction = PrismaNamespace.TransactionClient;

const prisma = new PrismaClient();
const now = new Date("2026-08-24T03:00:00.000Z");

function uuidV7(value: number): string {
  return `01941f29-7c00-7000-8000-${value.toString(16).padStart(12, "0")}`;
}

interface TenantFixture {
  readonly organizationId: string;
  readonly userId: string;
  readonly workspaceId: string;
}

async function seedTenant(tx: Transaction, offset: number): Promise<TenantFixture> {
  const userId = uuidV7(offset + 1);
  const organizationId = uuidV7(offset + 2);
  const workspaceId = uuidV7(offset + 3);

  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "users" ("id", "email", "display_name", "status", "created_at", "updated_at")
    VALUES (${userId}::uuid, ${`user-${offset}@example.test`}, 'Database test user', 'ACTIVE', ${now}, ${now})
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "organizations" ("id", "name", "slug", "status", "created_at", "updated_at")
    VALUES (${organizationId}::uuid, 'Test organization', ${`organization-${offset}`}, 'ACTIVE', ${now}, ${now})
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "workspaces" ("id", "organization_id", "name", "slug", "timezone", "status", "created_at", "updated_at")
    VALUES (${workspaceId}::uuid, ${organizationId}::uuid, 'Test workspace', ${`workspace-${offset}`}, 'Asia/Jakarta', 'ACTIVE', ${now}, ${now})
  `);

  return { organizationId, userId, workspaceId };
}

interface PublishingFixture extends TenantFixture {
  readonly accountId: string;
  readonly datasetId: string;
  readonly deviceId: string;
  readonly jobId: string;
  readonly mediaAssetId: string;
  readonly projectId: string;
  readonly projectItemId: string;
  readonly workerId: string;
}

async function insertPublishJob(
  tx: Transaction,
  fixture: Omit<PublishingFixture, "jobId">,
  jobId: string,
  idempotencyCharacter: string,
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "publish_jobs" (
      "id", "workspace_id", "project_id", "project_item_id", "account_id", "media_asset_id",
      "device_id", "publisher_kind", "status", "priority", "execution_slot_id", "scheduled_for",
      "available_at", "idempotency_key", "attempt_count", "max_attempts", "created_by_user_id",
      "created_at", "updated_at", "version"
    ) VALUES (
      ${jobId}::uuid, ${fixture.workspaceId}::uuid, ${fixture.projectId}::uuid,
      ${fixture.projectItemId}::uuid, ${fixture.accountId}::uuid, ${fixture.mediaAssetId}::uuid,
      ${fixture.deviceId}::uuid, 'MOCK', 'DRAFT', 'NORMAL', ${uuidV7(Number.parseInt(jobId.slice(-6), 16) + 1000)}::uuid,
      ${now}, ${now}, ${idempotencyCharacter.repeat(64)}, 0, 3, ${fixture.userId}::uuid, ${now}, ${now}, 1
    )
  `);
}

async function seedPublishingGraph(tx: Transaction, offset: number): Promise<PublishingFixture> {
  const tenant = await seedTenant(tx, offset);
  const workerId = uuidV7(offset + 10);
  const deviceId = uuidV7(offset + 11);
  const accountId = uuidV7(offset + 12);
  const mediaAssetId = uuidV7(offset + 13);
  const datasetId = uuidV7(offset + 14);
  const datasetItemId = uuidV7(offset + 15);
  const projectId = uuidV7(offset + 16);
  const projectItemId = uuidV7(offset + 17);
  const jobId = uuidV7(offset + 18);

  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "workers" ("id", "workspace_id", "name", "instance_key", "status", "version", "platform", "capabilities", "created_at", "updated_at", "version_counter")
    VALUES (${workerId}::uuid, ${tenant.workspaceId}::uuid, 'Test worker', ${`instance-${offset}`}, 'ACTIVE', '0.0.0', 'TEST', '{}'::jsonb, ${now}, ${now}, 1)
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "devices" ("id", "workspace_id", "worker_id", "name", "adb_serial", "connection_type", "status", "created_at", "updated_at", "version")
    VALUES (${deviceId}::uuid, ${tenant.workspaceId}::uuid, ${workerId}::uuid, 'Test device', ${`serial-${offset}`}, 'USB', 'ONLINE', ${now}, ${now}, 1)
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "shopee_accounts" ("id", "workspace_id", "display_name", "country_code", "status", "created_at", "updated_at", "version")
    VALUES (${accountId}::uuid, ${tenant.workspaceId}::uuid, 'Authorized test account', 'ID', 'ACTIVE', ${now}, ${now}, 1)
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "media_assets" ("id", "workspace_id", "source", "original_filename", "storage_key", "mime_type", "size_bytes", "sha256", "status", "created_at", "updated_at", "version")
    VALUES (${mediaAssetId}::uuid, ${tenant.workspaceId}::uuid, 'MANUAL_UPLOAD', 'test.mp4', ${`opaque-${offset}`}, 'video/mp4', 1000, ${Buffer.alloc(32, offset % 255)}, 'READY', ${now}, ${now}, 1)
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "datasets" ("id", "workspace_id", "name", "status", "created_by_user_id", "created_at", "updated_at", "version")
    VALUES (${datasetId}::uuid, ${tenant.workspaceId}::uuid, 'Test dataset', 'ACTIVE', ${tenant.userId}::uuid, ${now}, ${now}, 1)
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "dataset_items" ("id", "workspace_id", "dataset_id", "media_asset_id", "position", "custom_fields", "created_at", "updated_at")
    VALUES (${datasetItemId}::uuid, ${tenant.workspaceId}::uuid, ${datasetId}::uuid, ${mediaAssetId}::uuid, 0, '{}'::jsonb, ${now}, ${now})
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "projects" (
      "id", "workspace_id", "dataset_id", "account_id", "name", "status", "publisher_kind",
      "caption_mode", "minimum_interval_seconds", "max_attempts", "retry_policy", "created_by_user_id",
      "created_at", "updated_at", "version"
    ) VALUES (
      ${projectId}::uuid, ${tenant.workspaceId}::uuid, ${datasetId}::uuid, ${accountId}::uuid,
      'Test project', 'ACTIVE', 'MOCK', 'NONE', 0, 3, '{}'::jsonb, ${tenant.userId}::uuid, ${now}, ${now}, 1
    )
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "project_items" ("id", "workspace_id", "project_id", "dataset_item_id", "media_asset_id", "position", "status", "custom_fields", "created_at", "updated_at")
    VALUES (${projectItemId}::uuid, ${tenant.workspaceId}::uuid, ${projectId}::uuid, ${datasetItemId}::uuid, ${mediaAssetId}::uuid, 0, 'ACTIVE', '{}'::jsonb, ${now}, ${now})
  `);

  const fixture = {
    ...tenant,
    accountId,
    datasetId,
    deviceId,
    mediaAssetId,
    projectId,
    projectItemId,
    workerId,
  };
  await insertPublishJob(tx, fixture, jobId, "a");
  return { ...fixture, jobId };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PostgreSQL database invariants", () => {
  it("stores canonical UUIDv7 identifiers and rejects UUIDv4 primary keys", async () => {
    const rollback = new Error("rollback expected success fixture");
    await expect(
      prisma.$transaction(async (tx) => {
        const tenant = await seedTenant(tx, 1000);
        const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id"::text FROM "users" WHERE "id" = ${tenant.userId}::uuid
        `);
        expect(UserIdSchema.parse(rows[0]?.id)).toBe(tenant.userId);
        throw rollback;
      }),
    ).rejects.toBe(rollback);

    await expect(
      prisma.$transaction((tx) =>
        tx.$executeRaw(Prisma.sql`
          INSERT INTO "users" ("id", "email", "display_name", "status", "created_at", "updated_at")
          VALUES ('550e8400-e29b-41d4-a716-446655440000', 'uuid4@example.test', 'Invalid UUID', 'ACTIVE', ${now}, ${now})
        `),
      ),
    ).rejects.toThrow();
  });

  it("rejects duplicate workspace membership", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const tenant = await seedTenant(tx, 2000);
        const rolesFound = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id"::text FROM "roles" WHERE "code" = 'ADMIN'
        `);
        const roleId = rolesFound[0]?.id;
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "workspace_members" ("id", "workspace_id", "user_id", "role_id", "status", "created_at", "updated_at")
          VALUES (${uuidV7(2004)}::uuid, ${tenant.workspaceId}::uuid, ${tenant.userId}::uuid, ${roleId}::uuid, 'ACTIVE', ${now}, ${now})
        `);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "workspace_members" ("id", "workspace_id", "user_id", "role_id", "status", "created_at", "updated_at")
          VALUES (${uuidV7(2005)}::uuid, ${tenant.workspaceId}::uuid, ${tenant.userId}::uuid, ${roleId}::uuid, 'ACTIVE', ${now}, ${now})
        `);
      }),
    ).rejects.toThrow();
  });

  it("rejects a cross-workspace dataset relationship on a project", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const tenantA = await seedTenant(tx, 3000);
        const tenantB = await seedTenant(tx, 3100);
        const datasetA = uuidV7(3004);
        const accountB = uuidV7(3104);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "datasets" ("id", "workspace_id", "name", "status", "created_by_user_id", "created_at", "updated_at", "version")
          VALUES (${datasetA}::uuid, ${tenantA.workspaceId}::uuid, 'Dataset A', 'ACTIVE', ${tenantA.userId}::uuid, ${now}, ${now}, 1)
        `);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "shopee_accounts" ("id", "workspace_id", "display_name", "country_code", "status", "created_at", "updated_at", "version")
          VALUES (${accountB}::uuid, ${tenantB.workspaceId}::uuid, 'Account B', 'ID', 'ACTIVE', ${now}, ${now}, 1)
        `);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "projects" ("id", "workspace_id", "dataset_id", "account_id", "name", "status", "publisher_kind", "caption_mode", "minimum_interval_seconds", "max_attempts", "retry_policy", "created_by_user_id", "created_at", "updated_at", "version")
          VALUES (${uuidV7(3105)}::uuid, ${tenantB.workspaceId}::uuid, ${datasetA}::uuid, ${accountB}::uuid, 'Invalid cross-tenant project', 'ACTIVE', 'MOCK', 'NONE', 0, 3, '{}'::jsonb, ${tenantB.userId}::uuid, ${now}, ${now}, 1)
        `);
      }),
    ).rejects.toThrow();
  });

  it("rejects duplicate publish idempotency keys and unsafe upload requeue", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const fixture = await seedPublishingGraph(tx, 4000);
        await insertPublishJob(tx, fixture, uuidV7(4019), "a");
      }),
    ).rejects.toThrow();

    await expect(
      prisma.$transaction(async (tx) => {
        const fixture = await seedPublishingGraph(tx, 4100);
        await tx.$executeRaw(
          Prisma.sql`UPDATE "publish_jobs" SET "status" = 'QUEUED' WHERE "id" = ${fixture.jobId}::uuid`,
        );
        await tx.$executeRaw(
          Prisma.sql`UPDATE "publish_jobs" SET "status" = 'PREPARING' WHERE "id" = ${fixture.jobId}::uuid`,
        );
        await tx.$executeRaw(
          Prisma.sql`UPDATE "publish_jobs" SET "status" = 'UPLOADING' WHERE "id" = ${fixture.jobId}::uuid`,
        );
        await tx.$executeRaw(
          Prisma.sql`UPDATE "publish_jobs" SET "status" = 'QUEUED' WHERE "id" = ${fixture.jobId}::uuid`,
        );
      }),
    ).rejects.toThrow();
  });

  it("enforces one open device session and active lease per device/job", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const fixture = await seedPublishingGraph(tx, 5000);
        for (const sessionId of [uuidV7(5020), uuidV7(5021)]) {
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "device_sessions" ("id", "workspace_id", "device_id", "worker_id", "status", "started_at", "last_heartbeat_at", "sanitized_facts", "created_at", "updated_at")
            VALUES (${sessionId}::uuid, ${fixture.workspaceId}::uuid, ${fixture.deviceId}::uuid, ${fixture.workerId}::uuid, 'OPEN', ${now}, ${now}, '{}'::jsonb, ${now}, ${now})
          `);
        }
      }),
    ).rejects.toThrow();

    await expect(
      prisma.$transaction(async (tx) => {
        const fixture = await seedPublishingGraph(tx, 5100);
        for (const leaseId of [uuidV7(5120), uuidV7(5121)]) {
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "job_leases" ("id", "workspace_id", "job_id", "worker_id", "device_id", "lease_token_hash", "status", "offered_at", "ack_deadline_at", "expires_at", "version", "created_at", "updated_at")
            VALUES (${leaseId}::uuid, ${fixture.workspaceId}::uuid, ${fixture.jobId}::uuid, ${fixture.workerId}::uuid, ${fixture.deviceId}::uuid, ${Buffer.from(leaseId)}, 'OFFERED', ${now}, ${now}, ${now}, 1, ${now}, ${now})
          `);
        }
      }),
    ).rejects.toThrow();

    await expect(
      prisma.$transaction(async (tx) => {
        const fixture = await seedPublishingGraph(tx, 5200);
        const secondJobId = uuidV7(5219);
        await insertPublishJob(tx, fixture, secondJobId, "b");
        const firstJobLeaseId = uuidV7(5220);
        const secondJobLeaseId = uuidV7(5221);

        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "job_leases" ("id", "workspace_id", "job_id", "worker_id", "device_id", "lease_token_hash", "status", "offered_at", "ack_deadline_at", "expires_at", "version", "created_at", "updated_at")
          VALUES (${firstJobLeaseId}::uuid, ${fixture.workspaceId}::uuid, ${fixture.jobId}::uuid, ${fixture.workerId}::uuid, ${fixture.deviceId}::uuid, ${Buffer.from("first-device-lease-token")}, 'OFFERED', ${now}, ${now}, ${now}, 1, ${now}, ${now})
        `);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "job_leases" ("id", "workspace_id", "job_id", "worker_id", "device_id", "lease_token_hash", "status", "offered_at", "ack_deadline_at", "expires_at", "version", "created_at", "updated_at")
          VALUES (${secondJobLeaseId}::uuid, ${fixture.workspaceId}::uuid, ${secondJobId}::uuid, ${fixture.workerId}::uuid, ${fixture.deviceId}::uuid, ${Buffer.from("second-device-lease-token")}, 'OFFERED', ${now}, ${now}, ${now}, 1, ${now}, ${now})
        `);

        for (const [deviceLeaseId, jobId, jobLeaseId] of [
          [uuidV7(5222), fixture.jobId, firstJobLeaseId],
          [uuidV7(5223), secondJobId, secondJobLeaseId],
        ] as const) {
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "device_leases" ("id", "workspace_id", "device_id", "worker_id", "job_id", "job_lease_id", "status", "offered_at", "ack_deadline_at", "expires_at", "version", "created_at", "updated_at")
            VALUES (${deviceLeaseId}::uuid, ${fixture.workspaceId}::uuid, ${fixture.deviceId}::uuid, ${fixture.workerId}::uuid, ${jobId}::uuid, ${jobLeaseId}::uuid, 'OFFERED', ${now}, ${now}, ${now}, 1, ${now}, ${now})
          `);
        }
      }),
    ).rejects.toThrow();
  });

  it("rejects worker/device and device-lease assignment mismatches", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const fixture = await seedPublishingGraph(tx, 5400);
        const otherWorkerId = uuidV7(5420);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "workers" ("id", "workspace_id", "name", "instance_key", "status", "version", "platform", "capabilities", "created_at", "updated_at", "version_counter")
          VALUES (${otherWorkerId}::uuid, ${fixture.workspaceId}::uuid, 'Other worker', 'instance-5420', 'ACTIVE', '0.0.0', 'TEST', '{}'::jsonb, ${now}, ${now}, 1)
        `);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "device_sessions" ("id", "workspace_id", "device_id", "worker_id", "status", "started_at", "last_heartbeat_at", "sanitized_facts", "created_at", "updated_at")
          VALUES (${uuidV7(5421)}::uuid, ${fixture.workspaceId}::uuid, ${fixture.deviceId}::uuid, ${otherWorkerId}::uuid, 'OPEN', ${now}, ${now}, '{}'::jsonb, ${now}, ${now})
        `);
      }),
    ).rejects.toThrow();

    await expect(
      prisma.$transaction(async (tx) => {
        const fixture = await seedPublishingGraph(tx, 5500);
        const otherDeviceId = uuidV7(5520);
        const jobLeaseId = uuidV7(5521);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "devices" ("id", "workspace_id", "worker_id", "name", "adb_serial", "connection_type", "status", "created_at", "updated_at", "version")
          VALUES (${otherDeviceId}::uuid, ${fixture.workspaceId}::uuid, ${fixture.workerId}::uuid, 'Other device', 'serial-5520', 'USB', 'ONLINE', ${now}, ${now}, 1)
        `);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "job_leases" ("id", "workspace_id", "job_id", "worker_id", "device_id", "lease_token_hash", "status", "offered_at", "ack_deadline_at", "expires_at", "version", "created_at", "updated_at")
          VALUES (${jobLeaseId}::uuid, ${fixture.workspaceId}::uuid, ${fixture.jobId}::uuid, ${fixture.workerId}::uuid, ${fixture.deviceId}::uuid, ${Buffer.from("assignment-token")}, 'OFFERED', ${now}, ${now}, ${now}, 1, ${now}, ${now})
        `);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "device_leases" ("id", "workspace_id", "device_id", "worker_id", "job_id", "job_lease_id", "status", "offered_at", "ack_deadline_at", "expires_at", "version", "created_at", "updated_at")
          VALUES (${uuidV7(5522)}::uuid, ${fixture.workspaceId}::uuid, ${otherDeviceId}::uuid, ${fixture.workerId}::uuid, ${fixture.jobId}::uuid, ${jobLeaseId}::uuid, 'OFFERED', ${now}, ${now}, ${now}, 1, ${now}, ${now})
        `);
      }),
    ).rejects.toThrow();
  });

  it("keeps migrated role, permission, and job-state data synchronized", async () => {
    const migratedRoles = await prisma.$queryRaw<Array<{ code: string }>>(Prisma.sql`
      SELECT "code"::text FROM "roles" ORDER BY "id"
    `);
    expect(migratedRoles.map(({ code }) => code)).toEqual(roles);

    const migratedStates = await prisma.$queryRaw<Array<{ value: string }>>(Prisma.sql`
      SELECT e.enumlabel AS value
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'publish_job_status' AND n.nspname = current_schema()
      ORDER BY e.enumsortorder
    `);
    expect(migratedStates.map(({ value }) => value)).toEqual(publishJobStates);

    const mappings = await prisma.$queryRaw<Array<{ permission: string; role: string }>>(Prisma.sql`
      SELECT r."code"::text AS role, p."code" AS permission
      FROM "role_permissions" rp
      JOIN "roles" r ON r."id" = rp."role_id"
      JOIN "permissions" p ON p."id" = rp."permission_id"
      ORDER BY r."id", p."id"
    `);
    for (const role of roles) {
      expect(mappings.filter((row) => row.role === role).map((row) => row.permission)).toEqual(
        ROLE_PERMISSIONS[role],
      );
    }
  });

  it("restricts deletion of workspace roots while tenant records remain", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const tenant = await seedTenant(tx, 6000);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "datasets" ("id", "workspace_id", "name", "status", "created_by_user_id", "created_at", "updated_at", "version")
          VALUES (${uuidV7(6004)}::uuid, ${tenant.workspaceId}::uuid, 'Retained dataset', 'ACTIVE', ${tenant.userId}::uuid, ${now}, ${now}, 1)
        `);
        await tx.$executeRaw(
          Prisma.sql`DELETE FROM "workspaces" WHERE "id" = ${tenant.workspaceId}::uuid`,
        );
      }),
    ).rejects.toThrow();
  });
});
