import { z } from "zod";

import { PermissionSchema, RoleSchema } from "./access-control";
import { UserIdSchema, UserSessionIdSchema, WorkspaceIdSchema } from "./identifiers";

export const activeLifecycleStatus = "ACTIVE" as const;

export const organizationStatuses = ["ACTIVE", "SUSPENDED"] as const;
export const workspaceStatuses = ["ACTIVE", "SUSPENDED"] as const;
export const membershipStatuses = ["ACTIVE", "SUSPENDED", "REVOKED"] as const;

export const OrganizationStatusSchema = z.enum(organizationStatuses);
export const WorkspaceStatusSchema = z.enum(workspaceStatuses);
export const MembershipStatusSchema = z.enum(membershipStatuses);

export const authAuditActions = [
  "AUTH_LOGIN_SUCCESS",
  "AUTH_LOGIN_FAILURE",
  "AUTH_LOGOUT",
  "SESSION_REVOKED",
  "SUPER_ADMIN_BOOTSTRAPPED",
  "WORKSPACE_SELECTED",
  "AUTHORIZATION_DENIED",
] as const;

export const AuthAuditActionSchema = z.enum(authAuditActions);
export type AuthAuditAction = z.infer<typeof AuthAuditActionSchema>;

export const LoginRequestSchema = z
  .object({
    email: z.string().trim().max(320).toLowerCase().pipe(z.email()),
    password: z.string().min(1).max(1_024),
  })
  .strict();

export type LoginRequest = Readonly<z.infer<typeof LoginRequestSchema>>;

export const WorkspaceSelectionRequestSchema = z
  .object({ workspaceId: WorkspaceIdSchema })
  .strict();

export type WorkspaceSelectionRequest = Readonly<z.infer<typeof WorkspaceSelectionRequestSchema>>;

export const AuthenticatedContextSchema = z
  .object({
    userId: UserIdSchema,
    sessionId: UserSessionIdSchema,
    workspaceId: WorkspaceIdSchema,
    role: RoleSchema,
    permissions: z.array(PermissionSchema).readonly(),
  })
  .strict();

export type AuthenticatedContext = Readonly<z.infer<typeof AuthenticatedContextSchema>>;
