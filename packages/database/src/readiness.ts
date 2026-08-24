import { Prisma } from "@prisma/client";

import { getDatabaseClient } from "./client";

export interface DatabaseReadinessClient {
  readonly $queryRaw: <T = unknown>(query: Prisma.Sql) => Promise<T>;
}

export async function isDatabaseReady(
  client: DatabaseReadinessClient = getDatabaseClient(),
): Promise<boolean> {
  try {
    await client.$queryRaw(Prisma.sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
