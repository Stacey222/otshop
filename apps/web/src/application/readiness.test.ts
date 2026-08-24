import { describe, expect, it, vi } from "vitest";

import { getReadinessResult } from "./readiness";

describe("control-plane readiness", () => {
  it("reports ready only after a successful configured database probe", async () => {
    const probe = vi.fn().mockResolvedValue(true);
    await expect(getReadinessResult(true, probe)).resolves.toEqual({
      body: { service: "control-plane", status: "ready" },
      httpStatus: 200,
    });
    expect(probe).toHaveBeenCalledOnce();
  });

  it("does not probe or expose details when database configuration is absent", async () => {
    const probe = vi.fn().mockRejectedValue(new Error("secret database details"));
    await expect(getReadinessResult(false, probe)).resolves.toEqual({
      body: { service: "control-plane", status: "unavailable" },
      httpStatus: 503,
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it("returns only a sanitized unavailable response after probe failure", async () => {
    const result = await getReadinessResult(true, async () => {
      throw new Error("connect ECONNREFUSED postgresql://user:secret@database/private");
    });
    expect(result).toEqual({
      body: { service: "control-plane", status: "unavailable" },
      httpStatus: 503,
    });
    expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
  });
});
