import { ROLE_PERMISSIONS, hasPermission, type Role } from "@otshop/shared";
import { describe, expect, it } from "vitest";

describe("server-side role permission behavior", () => {
  it.each([
    ["SUPER_ADMIN", "system.manage", "unknown.permission"],
    ["ADMIN", "workspace.manage", "system.manage"],
    ["SUPERVISOR", "projects.write", "settings.manage"],
    ["OPERATOR", "jobs.create", "jobs.resolve_review"],
    ["VIEWER", "jobs.read", "jobs.create"],
  ] as const)("checks representative allow/deny behavior for %s", (role, allowed, denied) => {
    expect(ROLE_PERMISSIONS[role]).toContain(allowed);
    expect(hasPermission(role, allowed)).toBe(true);
    expect(ROLE_PERMISSIONS[role]).not.toContain(denied);
    expect(hasPermission(role, denied)).toBe(false);
  });

  it("never grants for unknown input", () => {
    expect(hasPermission("ROOT" satisfies Exclude<string, Role>, "system.manage")).toBe(false);
    expect(hasPermission("SUPER_ADMIN", "anything.*")).toBe(false);
  });
});
