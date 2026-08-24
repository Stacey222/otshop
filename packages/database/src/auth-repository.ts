import { Prisma, PrismaClient, type RoleCode, type UserStatus } from "@prisma/client";
import type { AuthAuditAction } from "@otshop/shared";

import { getDatabaseClient } from "./client";

export interface LoginIdentityRecord {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly userStatus: UserStatus;
  readonly passwordHash: string;
  readonly failedAttempts: number;
  readonly lockedUntil: Date | null;
}

export interface SessionIdentityRecord {
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly userStatus: UserStatus;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly systemRoles: readonly RoleCode[];
}

export interface WorkspaceAccessRecord {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly workspaceStatus: string;
  readonly organizationName: string;
  readonly organizationStatus: string;
  readonly membershipStatus: string;
  readonly role: RoleCode;
}

export interface AuditWrite {
  readonly id: string;
  readonly action: AuthAuditAction;
  readonly actorId: string;
  readonly actorType: "ANONYMOUS" | "SYSTEM" | "USER";
  readonly requestId: string;
  readonly resourceId: string;
  readonly resourceType: "AUTHENTICATION" | "SESSION" | "USER" | "WORKSPACE";
  readonly workspaceId?: string;
  readonly organizationId?: string;
  readonly beforeData?: Prisma.InputJsonValue;
  readonly afterData?: Prisma.InputJsonValue;
  readonly ipPrefix?: string;
}

export interface CreateSessionWrite {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: Uint8Array;
  readonly expiresAt: Date;
  readonly now: Date;
  readonly ipPrefix?: string;
  readonly userAgentFamily?: string;
}

export interface BootstrapWrite {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly now: Date;
  readonly audit: AuditWrite;
}

export class BootstrapAlreadyCompletedError extends Error {
  override readonly name = "BootstrapAlreadyCompletedError";
}

const auditData = (input: AuditWrite): Prisma.AuditLogUncheckedCreateInput => ({
  id: input.id,
  actorType: input.actorType,
  actorId: input.actorId,
  action: input.action,
  resourceType: input.resourceType,
  resourceId: input.resourceId,
  requestId: input.requestId,
  ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
  ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
  ...(input.beforeData === undefined ? {} : { beforeData: input.beforeData }),
  ...(input.afterData === undefined ? {} : { afterData: input.afterData }),
  ...(input.ipPrefix === undefined ? {} : { ipPrefix: input.ipPrefix }),
});

const sessionData = (input: CreateSessionWrite): Prisma.UserSessionUncheckedCreateInput => ({
  id: input.id,
  userId: input.userId,
  tokenHash: Uint8Array.from(input.tokenHash),
  expiresAt: input.expiresAt,
  lastSeenAt: input.now,
  ...(input.ipPrefix === undefined ? {} : { ipPrefix: input.ipPrefix }),
  ...(input.userAgentFamily === undefined ? {} : { userAgentFamily: input.userAgentFamily }),
});

export class AuthenticationRepository {
  constructor(private readonly client: PrismaClient = getDatabaseClient()) {}

  async findLoginIdentity(email: string): Promise<LoginIdentityRecord | null> {
    const user = await this.client.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        credential: {
          select: { passwordHash: true, failedAttempts: true, lockedUntil: true },
        },
      },
    });
    if (user?.credential === null || user === null) return null;
    return {
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
      userStatus: user.status,
      passwordHash: user.credential.passwordHash,
      failedAttempts: user.credential.failedAttempts,
      lockedUntil: user.credential.lockedUntil,
    };
  }

  async recordLoginFailure(input: {
    readonly userId?: string;
    readonly lockAtAttempt: number;
    readonly lockedUntil: Date;
    readonly audit: AuditWrite;
  }): Promise<void> {
    await this.client.$transaction(async (tx) => {
      if (input.userId !== undefined) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "user_credentials"
          SET "failed_attempts" = "failed_attempts" + 1,
              "locked_until" = CASE
                WHEN "failed_attempts" + 1 >= ${input.lockAtAttempt} THEN ${input.lockedUntil}
                ELSE "locked_until"
              END,
              "updated_at" = CURRENT_TIMESTAMP
          WHERE "user_id" = ${input.userId}::uuid
        `);
      }
      await tx.auditLog.create({ data: auditData(input.audit) });
    });
  }

  async createLoginSession(input: {
    readonly session: CreateSessionWrite;
    readonly replacementPasswordHash?: string;
    readonly audit: AuditWrite;
  }): Promise<void> {
    await this.client.$transaction(async (tx) => {
      await tx.userCredential.update({
        where: { userId: input.session.userId },
        data: {
          failedAttempts: 0,
          lockedUntil: null,
          ...(input.replacementPasswordHash === undefined
            ? {}
            : { passwordHash: input.replacementPasswordHash }),
        },
      });
      await tx.user.update({
        where: { id: input.session.userId },
        data: { lastLoginAt: input.session.now },
      });
      await tx.userSession.create({ data: sessionData(input.session) });
      await tx.auditLog.create({ data: auditData(input.audit) });
    });
  }

  async findSession(tokenHash: Uint8Array): Promise<SessionIdentityRecord | null> {
    const session = await this.client.userSession.findUnique({
      where: { tokenHash: Uint8Array.from(tokenHash) },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            email: true,
            displayName: true,
            status: true,
            systemRoles: { select: { role: { select: { code: true } } } },
          },
        },
      },
    });
    if (session === null) return null;
    return {
      sessionId: session.id,
      userId: session.userId,
      email: session.user.email,
      displayName: session.user.displayName,
      userStatus: session.user.status,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      systemRoles: session.user.systemRoles.map(({ role }) => role.code),
    };
  }

  async touchSession(sessionId: string, now: Date): Promise<void> {
    await this.client.userSession.updateMany({
      where: { id: sessionId, revokedAt: null, expiresAt: { gt: now } },
      data: { lastSeenAt: now },
    });
  }

  async rotateSession(input: {
    readonly oldSessionId: string;
    readonly session: CreateSessionWrite;
    readonly audit: AuditWrite;
  }): Promise<boolean> {
    return this.client.$transaction(async (tx) => {
      const revoked = await tx.userSession.updateMany({
        where: {
          id: input.oldSessionId,
          userId: input.session.userId,
          revokedAt: null,
          expiresAt: { gt: input.session.now },
        },
        data: { revokedAt: input.session.now },
      });
      if (revoked.count !== 1) return false;
      await tx.userSession.create({ data: sessionData(input.session) });
      await tx.auditLog.create({ data: auditData(input.audit) });
      return true;
    });
  }

  async revokeSession(input: {
    readonly sessionId: string;
    readonly userId: string;
    readonly now: Date;
    readonly audit: AuditWrite;
  }): Promise<boolean> {
    return this.client.$transaction(async (tx) => {
      const revoked = await tx.userSession.updateMany({
        where: { id: input.sessionId, userId: input.userId, revokedAt: null },
        data: { revokedAt: input.now },
      });
      if (revoked.count !== 1) return false;
      await tx.auditLog.create({ data: auditData(input.audit) });
      return true;
    });
  }

  async revokeAllUserSessions(input: {
    readonly userId: string;
    readonly now: Date;
    readonly audit: AuditWrite;
  }): Promise<number> {
    return this.client.$transaction(async (tx) => {
      const revoked = await tx.userSession.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: input.now },
      });
      await tx.auditLog.create({ data: auditData(input.audit) });
      return revoked.count;
    });
  }

  async listWorkspaceAccess(userId: string): Promise<readonly WorkspaceAccessRecord[]> {
    const memberships = await this.client.workspaceMember.findMany({
      where: { userId },
      orderBy: [{ workspace: { organization: { name: "asc" } } }, { workspace: { name: "asc" } }],
      select: {
        status: true,
        role: { select: { code: true } },
        workspace: {
          select: {
            id: true,
            name: true,
            status: true,
            organization: { select: { name: true, status: true } },
          },
        },
      },
    });
    return memberships.map((membership) => ({
      workspaceId: membership.workspace.id,
      workspaceName: membership.workspace.name,
      workspaceStatus: membership.workspace.status,
      organizationName: membership.workspace.organization.name,
      organizationStatus: membership.workspace.organization.status,
      membershipStatus: membership.status,
      role: membership.role.code,
    }));
  }

  async findWorkspaceAccess(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceAccessRecord | null> {
    const membership = await this.client.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: {
        status: true,
        role: { select: { code: true } },
        workspace: {
          select: {
            id: true,
            name: true,
            status: true,
            organization: { select: { name: true, status: true } },
          },
        },
      },
    });
    if (membership === null) return null;
    return {
      workspaceId: membership.workspace.id,
      workspaceName: membership.workspace.name,
      workspaceStatus: membership.workspace.status,
      organizationName: membership.workspace.organization.name,
      organizationStatus: membership.workspace.organization.status,
      membershipStatus: membership.status,
      role: membership.role.code,
    };
  }

  async createAudit(input: AuditWrite): Promise<void> {
    await this.client.auditLog.create({ data: auditData(input) });
  }

  async bootstrapSuperAdmin(input: BootstrapWrite): Promise<void> {
    await this.client.$transaction(
      async (tx) => {
        const existing = await tx.userSystemRole.count({
          where: { role: { code: "SUPER_ADMIN" } },
        });
        if (existing !== 0) throw new BootstrapAlreadyCompletedError("Super admin already exists");
        const role = await tx.role.findUnique({
          where: { code: "SUPER_ADMIN" },
          select: { id: true },
        });
        if (role === null) throw new Error("Canonical SUPER_ADMIN role is missing");
        await tx.user.create({
          data: {
            id: input.userId,
            email: input.email,
            displayName: input.displayName,
            status: "ACTIVE",
            credential: {
              create: {
                passwordHash: input.passwordHash,
                passwordChangedAt: input.now,
              },
            },
          },
        });
        await tx.userSystemRole.create({
          data: {
            userId: input.userId,
            roleId: role.id,
            grantedByUserId: input.userId,
          },
        });
        await tx.auditLog.create({ data: auditData(input.audit) });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
