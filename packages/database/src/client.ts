import { PrismaClient } from "@prisma/client";

const globalDatabase = globalThis as typeof globalThis & {
  otshopPrismaClient?: PrismaClient;
};

function createDatabaseClient(): PrismaClient {
  return new PrismaClient();
}

export function getDatabaseClient(): PrismaClient {
  globalDatabase.otshopPrismaClient ??= createDatabaseClient();
  return globalDatabase.otshopPrismaClient;
}

export async function disconnectDatabaseClient(): Promise<void> {
  if (globalDatabase.otshopPrismaClient !== undefined) {
    await globalDatabase.otshopPrismaClient.$disconnect();
    delete globalDatabase.otshopPrismaClient;
  }
}
