import type {
  AuditWrite,
  AuthenticationRepository,
  LoginIdentityRecord,
  SessionIdentityRecord,
  WorkspaceAccessRecord,
} from "@otshop/database";
import {
  AuthenticatedContextSchema,
  PermissionSchema,
  ROLE_PERMISSIONS,
  RoleSchema,
  UserIdSchema,
  UserSessionIdSchema,
  WorkspaceIdSchema,
  activeLifecycleStatus,
  createUuidV7,
  hasPermission,
  type AuthAuditAction,
  type AuthenticatedContext,
  type LoginRequest,
  type Role,
} from "@otshop/shared";

import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  InvalidCredentialsError,
  WorkspaceRequiredError,
} from "./auth-errors";
import type { PasswordHasher } from "./password";
import type { LoginRateLimiter } from "./rate-limiter";
import type { AuthRequestMetadata } from "./request-metadata";
import {
  createSessionMaterial,
  hashSessionToken,
  isPlausibleSessionToken,
  type SessionMaterial,
} from "./session-token";

const ACCOUNT_LOCK_ATTEMPTS = 5;
const ACCOUNT_LOCK_MS = 15 * 60 * 1_000;

type AuthenticationStore = Pick<
  AuthenticationRepository,
  | "createAudit"
  | "createLoginSession"
  | "findLoginIdentity"
  | "findSession"
  | "findWorkspaceAccess"
  | "listWorkspaceAccess"
  | "recordLoginFailure"
  | "revokeAllUserSessions"
  | "revokeSession"
  | "rotateSession"
  | "touchSession"
>;

export interface AuthenticatedSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly expiresAt: Date;
  readonly systemRoles: readonly Role[];
}

export interface LoginSuccess {
  readonly session: AuthenticatedSession;
  readonly material: SessionMaterial;
}

export interface WorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly organizationName: string;
  readonly role: Role;
}

const optional = <T>(value: T | undefined, key: string): Record<string, T> =>
  value === undefined ? {} : { [key]: value };

export class AuthenticationService {
  constructor(
    private readonly store: AuthenticationStore,
    private readonly passwords: PasswordHasher,
    private readonly rateLimiter: LoginRateLimiter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private audit(input: {
    readonly action: AuthAuditAction;
    readonly actorId: string;
    readonly actorType: AuditWrite["actorType"];
    readonly requestId: string;
    readonly resourceId: string;
    readonly resourceType: AuditWrite["resourceType"];
    readonly metadata: AuthRequestMetadata;
    readonly workspaceId?: string;
    readonly afterData?: AuditWrite["afterData"];
  }): AuditWrite {
    return {
      id: createUuidV7(this.clock().getTime()),
      action: input.action,
      actorId: input.actorId,
      actorType: input.actorType,
      requestId: input.requestId,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
      ...optional(input.metadata.ipPrefix, "ipPrefix"),
      ...optional(input.workspaceId, "workspaceId"),
      ...optional(input.afterData, "afterData"),
    };
  }

  private async failLogin(
    identity: LoginIdentityRecord | null,
    input: LoginRequest,
    metadata: AuthRequestMetadata,
    requestId: string,
    reason: "ACCOUNT_LOCKED" | "CREDENTIAL_MISMATCH" | "RATE_LIMITED" | "USER_INACTIVE",
  ): Promise<never> {
    const now = this.clock();
    this.rateLimiter.registerFailure(input.email, metadata.ipPrefix, now);
    await this.store.recordLoginFailure({
      ...(identity === null ? {} : { userId: identity.userId }),
      lockAtAttempt: ACCOUNT_LOCK_ATTEMPTS,
      lockedUntil: new Date(now.getTime() + ACCOUNT_LOCK_MS),
      audit: this.audit({
        action: "AUTH_LOGIN_FAILURE",
        actorId: identity?.userId ?? requestId,
        actorType: identity === null ? "ANONYMOUS" : "USER",
        requestId,
        resourceId: requestId,
        resourceType: "AUTHENTICATION",
        metadata,
        afterData: { reason },
      }),
    });
    throw new InvalidCredentialsError();
  }

  async login(
    input: LoginRequest,
    metadata: AuthRequestMetadata,
    requestId: string,
  ): Promise<LoginSuccess> {
    const now = this.clock();
    if (!this.rateLimiter.isAllowed(input.email, metadata.ipPrefix, now)) {
      await this.failLogin(null, input, metadata, requestId, "RATE_LIMITED");
    }

    const identity = await this.store.findLoginIdentity(input.email);
    if (identity === null) {
      await this.passwords.verifyUnknown(input.password);
      return this.failLogin(null, input, metadata, requestId, "CREDENTIAL_MISMATCH");
    }

    const verification = await this.passwords.verify(identity.passwordHash, input.password);
    if (!verification.valid) {
      return this.failLogin(identity, input, metadata, requestId, "CREDENTIAL_MISMATCH");
    }
    if (identity.userStatus !== activeLifecycleStatus) {
      return this.failLogin(identity, input, metadata, requestId, "USER_INACTIVE");
    }
    if (identity.lockedUntil !== null && identity.lockedUntil.getTime() > now.getTime()) {
      return this.failLogin(identity, input, metadata, requestId, "ACCOUNT_LOCKED");
    }

    const material = createSessionMaterial(now);
    const replacementPasswordHash = verification.needsUpgrade
      ? await this.passwords.hash(input.password)
      : undefined;
    await this.store.createLoginSession({
      session: {
        id: material.id,
        userId: identity.userId,
        tokenHash: material.tokenHash,
        expiresAt: material.expiresAt,
        now,
        ...optional(metadata.ipPrefix, "ipPrefix"),
        ...optional(metadata.userAgentFamily, "userAgentFamily"),
      },
      ...optional(replacementPasswordHash, "replacementPasswordHash"),
      audit: this.audit({
        action: "AUTH_LOGIN_SUCCESS",
        actorId: identity.userId,
        actorType: "USER",
        requestId,
        resourceId: material.id,
        resourceType: "SESSION",
        metadata,
      }),
    });
    this.rateLimiter.reset(input.email, metadata.ipPrefix);
    return {
      material,
      session: {
        sessionId: material.id,
        userId: identity.userId,
        email: identity.email,
        displayName: identity.displayName,
        expiresAt: material.expiresAt,
        systemRoles: [],
      },
    };
  }

  private parseSession(record: SessionIdentityRecord, now: Date): AuthenticatedSession | null {
    if (
      record.revokedAt !== null ||
      record.expiresAt.getTime() <= now.getTime() ||
      record.userStatus !== activeLifecycleStatus
    ) {
      return null;
    }
    const userId = UserIdSchema.safeParse(record.userId);
    const sessionId = UserSessionIdSchema.safeParse(record.sessionId);
    const systemRoles = record.systemRoles
      .map((role) => RoleSchema.safeParse(role))
      .filter((result) => result.success)
      .map((result) => result.data);
    if (!userId.success || !sessionId.success) return null;
    return {
      sessionId: sessionId.data,
      userId: userId.data,
      email: record.email,
      displayName: record.displayName,
      expiresAt: record.expiresAt,
      systemRoles,
    };
  }

  async authenticate(rawToken: string | undefined): Promise<AuthenticatedSession | null> {
    if (rawToken === undefined || !isPlausibleSessionToken(rawToken)) return null;
    const now = this.clock();
    const record = await this.store.findSession(hashSessionToken(rawToken));
    if (record === null) return null;
    const session = this.parseSession(record, now);
    if (session === null) return null;
    await this.store.touchSession(session.sessionId, now);
    return session;
  }

  async requireAuthentication(rawToken: string | undefined): Promise<AuthenticatedSession> {
    const session = await this.authenticate(rawToken);
    if (session === null) throw new AuthenticationRequiredError();
    return session;
  }

  private activeWorkspace(record: WorkspaceAccessRecord): WorkspaceSummary | null {
    const workspaceId = WorkspaceIdSchema.safeParse(record.workspaceId);
    const role = RoleSchema.safeParse(record.role);
    if (
      !workspaceId.success ||
      !role.success ||
      role.data === "SUPER_ADMIN" ||
      record.organizationStatus !== activeLifecycleStatus ||
      record.workspaceStatus !== activeLifecycleStatus ||
      record.membershipStatus !== activeLifecycleStatus
    ) {
      return null;
    }
    return {
      id: workspaceId.data,
      name: record.workspaceName,
      organizationName: record.organizationName,
      role: role.data,
    };
  }

  async listWorkspaces(session: AuthenticatedSession): Promise<readonly WorkspaceSummary[]> {
    return (await this.store.listWorkspaceAccess(session.userId))
      .map((record) => this.activeWorkspace(record))
      .filter((record): record is WorkspaceSummary => record !== null);
  }

  async resolveContext(
    session: AuthenticatedSession,
    workspaceId: string | undefined,
  ): Promise<AuthenticatedContext> {
    if (workspaceId === undefined) throw new WorkspaceRequiredError();
    const parsedWorkspaceId = WorkspaceIdSchema.safeParse(workspaceId);
    if (!parsedWorkspaceId.success) throw new AuthorizationDeniedError();
    const record = await this.store.findWorkspaceAccess(session.userId, parsedWorkspaceId.data);
    const workspace = record === null ? null : this.activeWorkspace(record);
    if (workspace === null) throw new AuthorizationDeniedError();
    return AuthenticatedContextSchema.parse({
      userId: session.userId,
      sessionId: session.sessionId,
      workspaceId: workspace.id,
      role: workspace.role,
      permissions: ROLE_PERMISSIONS[workspace.role],
    });
  }

  async requirePermission(input: {
    readonly session: AuthenticatedSession;
    readonly workspaceId: string | undefined;
    readonly permission: unknown;
    readonly requestId: string;
    readonly metadata: AuthRequestMetadata;
  }): Promise<AuthenticatedContext> {
    let context: AuthenticatedContext;
    try {
      context = await this.resolveContext(input.session, input.workspaceId);
    } catch (error) {
      await this.auditAuthorizationDenied(input, undefined);
      throw error;
    }
    const permission = PermissionSchema.safeParse(input.permission);
    if (!permission.success || !hasPermission(context.role, permission.data)) {
      await this.auditAuthorizationDenied(input, context.workspaceId);
      throw new AuthorizationDeniedError();
    }
    return context;
  }

  private async auditAuthorizationDenied(
    input: {
      readonly session: AuthenticatedSession;
      readonly workspaceId: string | undefined;
      readonly permission: unknown;
      readonly requestId: string;
      readonly metadata: AuthRequestMetadata;
    },
    validatedWorkspaceId: string | undefined,
  ): Promise<void> {
    await this.store.createAudit(
      this.audit({
        action: "AUTHORIZATION_DENIED",
        actorId: input.session.userId,
        actorType: "USER",
        requestId: input.requestId,
        resourceId: validatedWorkspaceId ?? input.requestId,
        resourceType: validatedWorkspaceId === undefined ? "AUTHENTICATION" : "WORKSPACE",
        metadata: input.metadata,
        ...optional(validatedWorkspaceId, "workspaceId"),
        afterData: { permission: String(input.permission).slice(0, 128) },
      }),
    );
  }

  async selectWorkspace(input: {
    readonly session: AuthenticatedSession;
    readonly workspaceId: string;
    readonly metadata: AuthRequestMetadata;
    readonly requestId: string;
  }): Promise<{ readonly context: AuthenticatedContext; readonly material: SessionMaterial }> {
    const context = await this.requirePermission({
      ...input,
      permission: "workspace.read",
    });
    const now = this.clock();
    const material = createSessionMaterial(now);
    const rotated = await this.store.rotateSession({
      oldSessionId: input.session.sessionId,
      session: {
        id: material.id,
        userId: input.session.userId,
        tokenHash: material.tokenHash,
        expiresAt: material.expiresAt,
        now,
        ...optional(input.metadata.ipPrefix, "ipPrefix"),
        ...optional(input.metadata.userAgentFamily, "userAgentFamily"),
      },
      audit: this.audit({
        action: "WORKSPACE_SELECTED",
        actorId: input.session.userId,
        actorType: "USER",
        requestId: input.requestId,
        resourceId: context.workspaceId,
        resourceType: "WORKSPACE",
        metadata: input.metadata,
        workspaceId: context.workspaceId,
        afterData: { role: context.role },
      }),
    });
    if (!rotated) throw new AuthenticationRequiredError();
    return {
      context: { ...context, sessionId: UserSessionIdSchema.parse(material.id) },
      material,
    };
  }

  async logout(input: {
    readonly session: AuthenticatedSession;
    readonly metadata: AuthRequestMetadata;
    readonly requestId: string;
  }): Promise<boolean> {
    const now = this.clock();
    return this.store.revokeSession({
      sessionId: input.session.sessionId,
      userId: input.session.userId,
      now,
      audit: this.audit({
        action: "AUTH_LOGOUT",
        actorId: input.session.userId,
        actorType: "USER",
        requestId: input.requestId,
        resourceId: input.session.sessionId,
        resourceType: "SESSION",
        metadata: input.metadata,
      }),
    });
  }

  async revokeAllSessions(input: {
    readonly actor: AuthenticatedContext;
    readonly targetUserId: string;
    readonly metadata: AuthRequestMetadata;
    readonly requestId: string;
  }): Promise<number> {
    if (!hasPermission(input.actor.role, "members.manage")) {
      await this.store.createAudit(
        this.audit({
          action: "AUTHORIZATION_DENIED",
          actorId: input.actor.userId,
          actorType: "USER",
          requestId: input.requestId,
          resourceId: input.requestId,
          resourceType: "USER",
          metadata: input.metadata,
          workspaceId: input.actor.workspaceId,
          afterData: { permission: "members.manage" },
        }),
      );
      throw new AuthorizationDeniedError();
    }
    const targetUserId = UserIdSchema.parse(input.targetUserId);
    const targetAccess = await this.store.findWorkspaceAccess(
      targetUserId,
      input.actor.workspaceId,
    );
    if (targetAccess === null || this.activeWorkspace(targetAccess) === null) {
      await this.store.createAudit(
        this.audit({
          action: "AUTHORIZATION_DENIED",
          actorId: input.actor.userId,
          actorType: "USER",
          requestId: input.requestId,
          resourceId: targetUserId,
          resourceType: "USER",
          metadata: input.metadata,
          workspaceId: input.actor.workspaceId,
          afterData: { permission: "members.manage", reason: "TARGET_OUTSIDE_WORKSPACE" },
        }),
      );
      throw new AuthorizationDeniedError();
    }
    const now = this.clock();
    return this.store.revokeAllUserSessions({
      userId: targetUserId,
      now,
      audit: this.audit({
        action: "SESSION_REVOKED",
        actorId: input.actor.userId,
        actorType: "USER",
        requestId: input.requestId,
        resourceId: targetUserId,
        resourceType: "USER",
        metadata: input.metadata,
        workspaceId: input.actor.workspaceId,
      }),
    });
  }
}
