import { Prisma, type PrismaClient } from "@prisma/client";

import { getDatabaseClient } from "./client";

export type DeveloperAccessDatabaseCode =
  | "DATABASE_AUTH_FAILED"
  | "DATABASE_SCHEMA_NOT_READY"
  | "DATABASE_UNREACHABLE"
  | "READY_FOR_BOOTSTRAP"
  | "READY_FOR_LOGIN";

export interface DeveloperAccessDatabaseResult {
  readonly code: DeveloperAccessDatabaseCode;
  readonly missingMigrations?: readonly string[];
  readonly superAdminState?: "SUPER_ADMIN_ALREADY_EXISTS" | "SUPER_ADMIN_NOT_CREATED";
}

export interface DeveloperAccessClient {
  readonly $queryRaw: (query: Prisma.Sql) => Promise<unknown>;
}

const databaseErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("errorCode" in error && typeof error.errorCode === "string") return error.errorCode;
  return undefined;
};

export const classifyDeveloperDatabaseError = (
  error: unknown,
): Exclude<DeveloperAccessDatabaseCode, "READY_FOR_BOOTSTRAP" | "READY_FOR_LOGIN"> => {
  const code = databaseErrorCode(error);
  if (code === "P1000") return "DATABASE_AUTH_FAILED";
  if (code === "P1001" || code === "P1002" || code === "P1008") {
    return "DATABASE_UNREACHABLE";
  }
  return "DATABASE_SCHEMA_NOT_READY";
};

export async function inspectDeveloperAccessDatabase(input: {
  readonly requiredMigrations: readonly string[];
  readonly client?: DeveloperAccessClient;
}): Promise<DeveloperAccessDatabaseResult> {
  const client = input.client ?? (getDatabaseClient() as PrismaClient);
  try {
    await client.$queryRaw(Prisma.sql`SELECT 1`);
    const migrationRows = (await client.$queryRaw(Prisma.sql`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
    `)) as readonly {
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }[];
    const applied = new Set(
      migrationRows
        .filter((row) => row.finished_at !== null && row.rolled_back_at === null)
        .map((row) => row.migration_name),
    );
    const missingMigrations = input.requiredMigrations.filter((name) => !applied.has(name));
    if (missingMigrations.length > 0) {
      return { code: "DATABASE_SCHEMA_NOT_READY", missingMigrations };
    }

    const rows = (await client.$queryRaw(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM user_system_roles grants
      JOIN roles ON roles.id = grants.role_id
      WHERE roles.code = 'SUPER_ADMIN'
    `)) as readonly { count: bigint }[];
    const hasSuperAdmin = (rows[0]?.count ?? 0n) > 0n;
    return hasSuperAdmin
      ? { code: "READY_FOR_LOGIN", superAdminState: "SUPER_ADMIN_ALREADY_EXISTS" }
      : { code: "READY_FOR_BOOTSTRAP", superAdminState: "SUPER_ADMIN_NOT_CREATED" };
  } catch (error) {
    return { code: classifyDeveloperDatabaseError(error) };
  }
}
