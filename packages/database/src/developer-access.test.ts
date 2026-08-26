import { describe, expect, it, vi } from "vitest";

import {
  classifyDeveloperDatabaseError,
  inspectDeveloperAccessDatabase,
  type DeveloperAccessClient,
} from "./developer-access";

const clientWith = (responses: readonly unknown[]): DeveloperAccessClient => {
  const queue = [...responses];
  return { $queryRaw: vi.fn(async () => queue.shift()) };
};

describe("developer access database diagnostics", () => {
  it("distinguishes safe connection failure categories without inspecting messages", () => {
    expect(classifyDeveloperDatabaseError({ errorCode: "P1000", message: "secret" })).toBe(
      "DATABASE_AUTH_FAILED",
    );
    expect(classifyDeveloperDatabaseError({ code: "P1001", message: "secret" })).toBe(
      "DATABASE_UNREACHABLE",
    );
    expect(classifyDeveloperDatabaseError(new Error("postgresql://user:secret@host/db"))).toBe(
      "DATABASE_SCHEMA_NOT_READY",
    );
  });

  it("reports missing migrations before bootstrap state", async () => {
    const client = clientWith([
      [{ value: 1 }],
      [{ migration_name: "001", finished_at: new Date(), rolled_back_at: null }],
    ]);
    await expect(
      inspectDeveloperAccessDatabase({ client, requiredMigrations: ["001", "002"] }),
    ).resolves.toEqual({ code: "DATABASE_SCHEMA_NOT_READY", missingMigrations: ["002"] });
  });

  it("distinguishes bootstrap and login readiness", async () => {
    const migrations = [{ migration_name: "001", finished_at: new Date(), rolled_back_at: null }];
    await expect(
      inspectDeveloperAccessDatabase({
        client: clientWith([[{ value: 1 }], migrations, [{ count: 0n }]]),
        requiredMigrations: ["001"],
      }),
    ).resolves.toEqual({
      code: "READY_FOR_BOOTSTRAP",
      superAdminState: "SUPER_ADMIN_NOT_CREATED",
    });
    await expect(
      inspectDeveloperAccessDatabase({
        client: clientWith([[{ value: 1 }], migrations, [{ count: 1n }]]),
        requiredMigrations: ["001"],
      }),
    ).resolves.toEqual({
      code: "READY_FOR_LOGIN",
      superAdminState: "SUPER_ADMIN_ALREADY_EXISTS",
    });
  });
});
