import { z } from "zod";

export const roles = ["SUPER_ADMIN", "ADMIN", "SUPERVISOR", "OPERATOR", "VIEWER"] as const;

export const RoleSchema = z.enum(roles);
export type Role = z.infer<typeof RoleSchema>;

export const permissions = [
  "system.manage",
  "workspace.read",
  "workspace.manage",
  "members.read",
  "members.manage",
  "accounts.read",
  "accounts.manage",
  "workers.read",
  "workers.manage",
  "devices.read",
  "devices.manage",
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
  "settings.manage",
] as const;

export const PermissionSchema = z.enum(permissions);
export type Permission = z.infer<typeof PermissionSchema>;

const adminPermissions = permissions.filter((permission) => permission !== "system.manage");

function freezePermissions<T extends readonly Permission[]>(values: T): Readonly<T> {
  return Object.freeze(values);
}

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = Object.freeze({
  SUPER_ADMIN: freezePermissions([...permissions]),
  ADMIN: freezePermissions(adminPermissions),
  SUPERVISOR: freezePermissions([
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
  ]),
  OPERATOR: freezePermissions([
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
  ]),
  VIEWER: freezePermissions([
    "workspace.read",
    "accounts.read",
    "workers.read",
    "devices.read",
    "datasets.read",
    "projects.read",
    "jobs.read",
    "schedules.read",
    "reports.read",
  ]),
});

export function hasPermission(role: unknown, permission: unknown): permission is Permission {
  const parsedRole = RoleSchema.safeParse(role);
  const parsedPermission = PermissionSchema.safeParse(permission);
  return (
    parsedRole.success &&
    parsedPermission.success &&
    ROLE_PERMISSIONS[parsedRole.data].includes(parsedPermission.data)
  );
}
