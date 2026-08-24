import { describe, expect, it, vi } from "vitest";

import { isDatabaseReady, type DatabaseReadinessClient } from "./readiness";

describe("database readiness", () => {
  it("returns true after a successful database probe", async () => {
    const client: DatabaseReadinessClient = {
      $queryRaw: vi.fn().mockResolvedValue([{ value: 1 }]),
    };
    await expect(isDatabaseReady(client)).resolves.toBe(true);
  });

  it("returns false without exposing a database error", async () => {
    const client: DatabaseReadinessClient = {
      $queryRaw: vi
        .fn()
        .mockRejectedValue(new Error("postgresql://user:secret@internal/production")),
    };
    await expect(isDatabaseReady(client)).resolves.toBe(false);
  });
});
