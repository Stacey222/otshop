import { describe, expect, it } from "vitest";

import {
  PermissionSchema,
  ROLE_PERMISSIONS,
  RoleSchema,
  hasPermission,
  permissions,
  roles,
} from "./access-control";

describe("access-control contracts", () => {
  it("fails closed for unknown roles and permissions", () => {
    expect(hasPermission("UNKNOWN", "workspace.read")).toBe(false);
    expect(hasPermission("ADMIN", "unknown.permission")).toBe(false);
  });

  it("accepts only the five authoritative roles", () => {
    expect(RoleSchema.options).toEqual(roles);
    expect(RoleSchema.safeParse("OWNER").success).toBe(false);
  });

  it("contains each documented permission exactly once", () => {
    expect(new Set(permissions).size).toBe(permissions.length);
    for (const permission of permissions) {
      expect(PermissionSchema.parse(permission)).toBe(permission);
    }
  });

  it("maps every role to a valid, duplicate-free, immutable permission list", () => {
    expect(Object.keys(ROLE_PERMISSIONS)).toEqual(roles);
    expect(Object.isFrozen(ROLE_PERMISSIONS)).toBe(true);

    for (const role of roles) {
      const rolePermissions = ROLE_PERMISSIONS[role];
      expect(Object.isFrozen(rolePermissions)).toBe(true);
      expect(new Set(rolePermissions).size).toBe(rolePermissions.length);
      expect(
        rolePermissions.every((permission) => PermissionSchema.safeParse(permission).success),
      ).toBe(true);
    }
  });

  it("evaluates the complete canonical role-permission matrix", () => {
    for (const role of roles) {
      for (const permission of permissions) {
        expect(hasPermission(role, permission)).toBe(ROLE_PERMISSIONS[role].includes(permission));
      }
    }
  });

  it("matches the Phase 1 permission matrix", () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toEqual(permissions);
    expect(ROLE_PERMISSIONS.ADMIN).toEqual(
      permissions.filter((permission) => permission !== "system.manage"),
    );
    expect(ROLE_PERMISSIONS.SUPERVISOR).toEqual([
      "workspace.read",
      "members.read",
      "accounts.read",
      "workers.read",
      "devices.read",
      "datasets.read",
      "datasets.write",
      "media.upload",
      "media.delete",
      "projects.read",
      "projects.write",
      "projects.run",
      "projects.pause_resume",
      "jobs.read",
      "jobs.create",
      "jobs.cancel",
      "jobs.retry",
      "jobs.resolve_review",
      "schedules.read",
      "schedules.manage",
      "reports.read",
      "reports.export",
      "audit.read",
    ]);
    expect(ROLE_PERMISSIONS.OPERATOR).toEqual([
      "workspace.read",
      "accounts.read",
      "workers.read",
      "devices.read",
      "datasets.read",
      "datasets.write",
      "media.upload",
      "projects.read",
      "projects.write",
      "projects.run",
      "projects.pause_resume",
      "jobs.read",
      "jobs.create",
      "jobs.cancel",
      "jobs.retry",
      "schedules.read",
      "reports.read",
    ]);
    expect(ROLE_PERMISSIONS.VIEWER).toEqual([
      "workspace.read",
      "accounts.read",
      "workers.read",
      "devices.read",
      "datasets.read",
      "projects.read",
      "jobs.read",
      "schedules.read",
      "reports.read",
    ]);
  });
});
