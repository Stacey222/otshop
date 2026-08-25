import {
  AuthenticationRepository,
  BootstrapAlreadyCompletedError,
  getDatabaseClient,
} from "@otshop/database";
import { WorkspaceIdSchema, createUuidV7 } from "@otshop/shared";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { POST as loginRoute } from "../src/app/api/auth/login/route";
import { POST as logoutRoute } from "../src/app/api/auth/logout/route";
import { GET as sessionRoute } from "../src/app/api/auth/session/route";
import { POST as selectWorkspaceRoute } from "../src/app/api/workspaces/select/route";
import { POST as executeMockPublisherRoute } from "../src/app/api/publishers/mock/execute/route";
import { POST as mediaIngestRoute } from "../src/app/api/media/route";
import { POST as mediaBatchCreateRoute } from "../src/app/api/media/batches/route";
import { POST as mediaInspectionRoute } from "../src/app/api/media/[mediaAssetId]/inspect/route";
import { POST as mediaThumbnailRoute } from "../src/app/api/media/[mediaAssetId]/thumbnail/route";
import { GET as datasetsRoute, POST as createDatasetRoute } from "../src/app/api/datasets/route";
import { POST as publisherPreflightRoute } from "../src/app/api/publishers/preflight/route";
import { GET as publishersRoute } from "../src/app/api/publishers/route";
import { AuthorizationDeniedError } from "../src/application/auth/auth-errors";
import { AuthenticationService } from "../src/application/auth/authentication-service";
import { SuperAdminBootstrapService } from "../src/application/auth/bootstrap-service";
import { Argon2idPasswordHasher } from "../src/application/auth/password";
import { LocalLoginRateLimiter } from "../src/application/auth/rate-limiter";
import { hashSessionToken } from "../src/application/auth/session-token";
import { publisherTestRequest } from "../src/application/publisher/publisher-test-fixtures";
import { validMp4 } from "../src/application/media/media-test-fixtures";
import { getStorageProvider } from "../src/infrastructure/media/runtime";

const prisma = getDatabaseClient();
const now = new Date();
const metadata = { ipPrefix: "127.0.0.0/24", userAgentFamily: "integration-test" } as const;

const id = (): string => createUuidV7(now.getTime());

describe("database-backed authentication and authorization", () => {
  it("enforces bootstrap, sessions, RBAC, audit, lifecycle, and tenant isolation", async () => {
    const repository = new AuthenticationRepository(prisma);
    const passwords = new Argon2idPasswordHasher();
    const bootstrap = new SuperAdminBootstrapService(repository, passwords, () => now);
    const bootstrapPassword = "Bootstrap-Only-Password!7";
    const bootstrapped = await bootstrap.bootstrap({
      email: "root@example.test",
      displayName: "Initial administrator",
      password: bootstrapPassword,
    });
    const bootstrapUser = await prisma.user.findUniqueOrThrow({
      where: { id: bootstrapped.userId },
      include: { credential: true, systemRoles: { include: { role: true } } },
    });
    expect(bootstrapUser.credential?.passwordHash).toMatch(/^\$argon2id\$/u);
    expect(bootstrapUser.credential?.passwordHash).not.toContain(bootstrapPassword);
    expect(bootstrapUser.systemRoles.map(({ role }) => role.code)).toEqual(["SUPER_ADMIN"]);
    await expect(
      passwords.verify(bootstrapUser.credential?.passwordHash ?? "", bootstrapPassword),
    ).resolves.toMatchObject({ valid: true });
    await expect(
      bootstrap.bootstrap({
        email: "second-root@example.test",
        displayName: "Second administrator",
        password: "Another-Bootstrap-Password!8",
      }),
    ).rejects.toBeInstanceOf(BootstrapAlreadyCompletedError);
    expect(await prisma.auditLog.count({ where: { action: "SUPER_ADMIN_BOOTSTRAPPED" } })).toBe(1);

    const organizationA = id();
    const organizationB = id();
    const workspaceA = id();
    const workspaceB = id();
    const userA = id();
    const userB = id();
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { code: "VIEWER" } });
    const passwordA = "Workspace-A-Password!7";
    const passwordB = "Workspace-B-Password!8";
    await prisma.$transaction(async (tx) => {
      await tx.organization.createMany({
        data: [
          {
            id: organizationA,
            name: "Organization A",
            slug: `organization-a-${organizationA}`,
            status: "ACTIVE",
          },
          {
            id: organizationB,
            name: "Organization B",
            slug: `organization-b-${organizationB}`,
            status: "ACTIVE",
          },
        ],
      });
      await tx.workspace.createMany({
        data: [
          {
            id: workspaceA,
            organizationId: organizationA,
            name: "Workspace A",
            slug: "workspace-a",
            timezone: "Asia/Jakarta",
            status: "ACTIVE",
          },
          {
            id: workspaceB,
            organizationId: organizationB,
            name: "Workspace B",
            slug: "workspace-b",
            timezone: "Asia/Jakarta",
            status: "ACTIVE",
          },
        ],
      });
      await tx.user.create({
        data: {
          id: userA,
          email: "user-a@example.test",
          displayName: "User A",
          status: "ACTIVE",
          credential: {
            create: { passwordHash: await passwords.hash(passwordA), passwordChangedAt: now },
          },
        },
      });
      await tx.user.create({
        data: {
          id: userB,
          email: "user-b@example.test",
          displayName: "User B",
          status: "ACTIVE",
          credential: {
            create: { passwordHash: await passwords.hash(passwordB), passwordChangedAt: now },
          },
        },
      });
      await tx.workspaceMember.createMany({
        data: [
          {
            id: id(),
            workspaceId: workspaceA,
            userId: userA,
            roleId: role.id,
            status: "ACTIVE",
            joinedAt: now,
          },
          {
            id: id(),
            workspaceId: workspaceB,
            userId: userB,
            roleId: role.id,
            status: "ACTIVE",
            joinedAt: now,
          },
        ],
      });
    });

    let currentTime = new Date(now);
    const auth = new AuthenticationService(
      repository,
      passwords,
      new LocalLoginRateLimiter(),
      () => currentTime,
    );
    expect(
      (await publishersRoute(new NextRequest("http://localhost:3000/api/publishers"))).status,
    ).toBe(401);
    expect(
      (await datasetsRoute(new NextRequest("http://localhost:3000/api/datasets"))).status,
    ).toBe(401);
    expect(
      (
        await createDatasetRoute(
          new NextRequest("http://localhost:3000/api/datasets", {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
            body: JSON.stringify({ name: "Unauthorized dataset" }),
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await mediaBatchCreateRoute(
          new NextRequest("http://localhost:3000/api/media/batches", {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
            body: JSON.stringify({ name: "Unauthorized batch" }),
          }),
        )
      ).status,
    ).toBe(401);
    const unauthorizedThumbnailId = id();
    expect(
      (
        await mediaThumbnailRoute(
          new NextRequest(`http://localhost:3000/api/media/${unauthorizedThumbnailId}/thumbnail`, {
            method: "POST",
            headers: { Origin: "http://localhost:3000" },
          }),
          {
            params: Promise.resolve({ mediaAssetId: unauthorizedThumbnailId }),
          } as RouteContext<"/api/media/[mediaAssetId]/thumbnail">,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await mediaIngestRoute(
          new NextRequest("http://localhost:3000/api/media", {
            method: "POST",
            headers: {
              "Content-Type": "video/mp4",
              "x-media-filename": "unauthorized.mp4",
              Origin: "http://localhost:3000",
            },
            body: validMp4,
          }),
        )
      ).status,
    ).toBe(401);
    await expect(
      auth.login({ email: "user-a@example.test", password: "wrong" }, metadata, id()),
    ).rejects.toThrow("Invalid email or password");
    await expect(
      auth.login({ email: "unknown@example.test", password: "wrong" }, metadata, id()),
    ).rejects.toThrow("Invalid email or password");

    const login = await auth.login(
      { email: "user-a@example.test", password: passwordA },
      metadata,
      id(),
    );

    const loginResponse = await loginRoute(
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "user-a@example.test", password: passwordA }),
      }),
    );
    expect(loginResponse.status).toBe(200);
    const loginBody = await loginResponse.text();
    expect(loginBody).not.toMatch(/password|token|hash/iu);
    const setCookie = loginResponse.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    const apiToken = /otshop_session=([^;]+)/u.exec(setCookie)?.[1];
    expect(apiToken).toBeDefined();
    const sessionResponse = await sessionRoute(
      new NextRequest("http://localhost:3000/api/auth/session", {
        headers: { Cookie: `otshop_session=${apiToken}` },
      }),
    );
    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.headers.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(await sessionResponse.json()).toMatchObject({
      user: { email: "user-a@example.test", displayName: "User A" },
      currentWorkspace: null,
    });
    const deniedSelectionResponse = await selectWorkspaceRoute(
      new NextRequest("http://localhost:3000/api/workspaces/select", {
        method: "POST",
        headers: {
          Cookie: `otshop_session=${apiToken}`,
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({ workspaceId: workspaceB }),
      }),
    );
    expect(deniedSelectionResponse.status).toBe(403);
    expect(await deniedSelectionResponse.json()).toMatchObject({
      error: { code: "AUTHORIZATION_DENIED" },
    });
    const apiLogoutResponse = await logoutRoute(
      new NextRequest("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { Cookie: `otshop_session=${apiToken}`, Origin: "http://localhost:3000" },
      }),
    );
    expect(apiLogoutResponse.status).toBe(204);
    expect(apiLogoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(
      (
        await sessionRoute(
          new NextRequest("http://localhost:3000/api/auth/session", {
            headers: { Cookie: `otshop_session=${apiToken}` },
          }),
        )
      ).status,
    ).toBe(401);

    expect(await auth.authenticate("tampered-cookie")).toBeNull();
    expect((await auth.authenticate(login.material.rawToken))?.userId).toBe(userA);
    expect(
      (await auth.listWorkspaces(login.session)).map(({ id: workspaceId }) => workspaceId),
    ).toEqual([workspaceA]);
    await expect(auth.resolveContext(login.session, workspaceB)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
    let mutationExecuted = false;
    await expect(
      auth
        .requirePermission({
          session: login.session,
          workspaceId: workspaceB,
          permission: "workspace.manage",
          requestId: id(),
          metadata,
        })
        .then(() => {
          mutationExecuted = true;
        }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(mutationExecuted).toBe(false);

    const selected = await auth.selectWorkspace({
      session: login.session,
      workspaceId: workspaceA,
      requestId: id(),
      metadata,
    });
    expect(selected.context.role).toBe("ADMIN");
    expect(selected.context.permissions).toContain("workspace.manage");
    expect(await auth.authenticate(login.material.rawToken)).toBeNull();
    expect(await auth.authenticate(selected.material.rawToken)).not.toBeNull();
    const selectedSession = await auth.requireAuthentication(selected.material.rawToken);
    const publisherCookie = `otshop_session=${selected.material.rawToken}; otshop_workspace=${workspaceA}`;
    const mockRequest = publisherTestRequest({
      workspaceId: WorkspaceIdSchema.parse(workspaceA),
    });
    const publishJobCountBefore = await prisma.publishJob.count();
    const publisherListResponse = await publishersRoute(
      new NextRequest("http://localhost:3000/api/publishers", {
        headers: { Cookie: publisherCookie },
      }),
    );
    expect(publisherListResponse.status).toBe(200);
    expect(await publisherListResponse.json()).toMatchObject({
      publishers: [
        { kind: "MOCK", available: true },
        { kind: "SHOPEE_ANDROID", available: false },
        { kind: "SHOPEE_OFFICIAL_API", available: false },
      ],
    });
    const datasetCreateResponse = await createDatasetRoute(
      new NextRequest("http://localhost:3000/api/datasets", {
        method: "POST",
        headers: {
          Cookie: publisherCookie,
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({ name: `Authorization dataset ${workspaceA}` }),
      }),
    );
    expect(datasetCreateResponse.status).toBe(201);
    const datasetCreateBody = (await datasetCreateResponse.json()) as {
      dataset: { datasetId: string };
    };
    const publisherPreflightResponse = await publisherPreflightRoute(
      new NextRequest("http://localhost:3000/api/publishers/preflight", {
        method: "POST",
        headers: {
          Cookie: publisherCookie,
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({ publisherKind: "MOCK", request: mockRequest }),
      }),
    );
    expect(publisherPreflightResponse.status).toBe(200);
    expect(await publisherPreflightResponse.json()).toMatchObject({
      preflight: { ready: true, requiredCapabilities: ["VIDEO_UPLOAD"] },
    });
    const mockExecutionResponse = await executeMockPublisherRoute(
      new NextRequest("http://localhost:3000/api/publishers/mock/execute", {
        method: "POST",
        headers: {
          Cookie: publisherCookie,
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({ request: mockRequest, scenario: "SUCCESS" }),
      }),
    );
    expect(mockExecutionResponse.status).toBe(200);
    expect(mockExecutionResponse.headers.get("x-request-id")).toBeTruthy();
    expect(await mockExecutionResponse.json()).toMatchObject({
      result: {
        ok: true,
        receipt: { externalReference: expect.stringMatching(/^mock:publication:/u) },
      },
    });
    const mediaHeaders = {
      Cookie: publisherCookie,
      "Content-Type": "video/mp4",
      "x-media-filename": encodeURIComponent("integration-😀.mp4"),
      Origin: "http://localhost:3000",
    };
    const mediaResponse = await mediaIngestRoute(
      new NextRequest("http://localhost:3000/api/media", {
        method: "POST",
        headers: mediaHeaders,
        body: validMp4,
      }),
    );
    expect(mediaResponse.status).toBe(201);
    expect(mediaResponse.headers.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    const mediaBody = await mediaResponse.json();
    expect(mediaBody).toMatchObject({
      media: {
        originalFilename: "integration-😀.mp4",
        mimeType: "video/mp4",
        sizeBytes: validMp4.byteLength,
        duplicate: false,
      },
    });
    expect(JSON.stringify(mediaBody)).not.toMatch(/storage|temporary|filesystem|DATABASE_URL/iu);
    const duplicateMediaResponse = await mediaIngestRoute(
      new NextRequest("http://localhost:3000/api/media", {
        method: "POST",
        headers: { ...mediaHeaders, "x-media-filename": "renamed.mp4" },
        body: validMp4,
      }),
    );
    expect(duplicateMediaResponse.status).toBe(200);
    expect(await duplicateMediaResponse.json()).toMatchObject({
      media: { mediaAssetId: mediaBody.media.mediaAssetId, duplicate: true },
    });
    const mediaInspectionContext = {
      params: Promise.resolve({ mediaAssetId: mediaBody.media.mediaAssetId as string }),
    } as RouteContext<"/api/media/[mediaAssetId]/inspect">;
    const rejectedInspection = await mediaInspectionRoute(
      new NextRequest(
        `http://localhost:3000/api/media/${mediaBody.media.mediaAssetId as string}/inspect`,
        {
          method: "POST",
          headers: { Cookie: publisherCookie, Origin: "http://localhost:3000" },
        },
      ),
      mediaInspectionContext,
    );
    expect(rejectedInspection.status).toBe(400);
    expect(await rejectedInspection.json()).toMatchObject({
      error: { code: "MEDIA_UNSUPPORTED" },
    });
    const malformedMultipart = await mediaIngestRoute(
      new NextRequest("http://localhost:3000/api/media", {
        method: "POST",
        headers: {
          Cookie: publisherCookie,
          "Content-Type": "multipart/form-data; boundary=invalid",
          "x-media-filename": "spoof.mp4",
          Origin: "http://localhost:3000",
        },
        body: "not multipart",
      }),
    );
    expect(malformedMultipart.status).toBe(400);
    expect(await malformedMultipart.json()).toMatchObject({
      error: { code: "UNSUPPORTED_MEDIA_TYPE" },
    });
    const missingFilename = await mediaIngestRoute(
      new NextRequest("http://localhost:3000/api/media", {
        method: "POST",
        headers: {
          Cookie: publisherCookie,
          "Content-Type": "video/mp4",
          Origin: "http://localhost:3000",
        },
        body: validMp4,
      }),
    );
    expect(missingFilename.status).toBe(400);
    expect(await missingFilename.json()).toMatchObject({
      error: { code: "INVALID_MEDIA_FILENAME" },
    });
    const declaredOversize = await mediaIngestRoute(
      new NextRequest("http://localhost:3000/api/media", {
        method: "POST",
        headers: { ...mediaHeaders, "Content-Length": "999999999" },
        body: validMp4,
      }),
    );
    expect(declaredOversize.status).toBe(400);
    expect(await declaredOversize.json()).toMatchObject({
      error: { code: "MEDIA_TOO_LARGE" },
    });
    const crossWorkspacePublisherResponse = await executeMockPublisherRoute(
      new NextRequest("http://localhost:3000/api/publishers/mock/execute", {
        method: "POST",
        headers: {
          Cookie: publisherCookie,
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          request: {
            ...mockRequest,
            workspaceId: workspaceB,
          },
          scenario: "SUCCESS",
        }),
      }),
    );
    expect(crossWorkspacePublisherResponse.status).toBe(403);
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: workspaceA, userId: userA } },
      data: { roleId: viewerRole.id },
    });
    expect(
      (
        await datasetsRoute(
          new NextRequest("http://localhost:3000/api/datasets", {
            headers: { Cookie: publisherCookie },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await createDatasetRoute(
          new NextRequest("http://localhost:3000/api/datasets", {
            method: "POST",
            headers: {
              Cookie: publisherCookie,
              "Content-Type": "application/json",
              Origin: "http://localhost:3000",
            },
            body: JSON.stringify({ name: "Viewer denied dataset" }),
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await executeMockPublisherRoute(
          new NextRequest("http://localhost:3000/api/publishers/mock/execute", {
            method: "POST",
            headers: {
              Cookie: publisherCookie,
              "Content-Type": "application/json",
              Origin: "http://localhost:3000",
            },
            body: JSON.stringify({ request: mockRequest, scenario: "SUCCESS" }),
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await mediaIngestRoute(
          new NextRequest("http://localhost:3000/api/media", {
            method: "POST",
            headers: mediaHeaders,
            body: validMp4,
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await mediaInspectionRoute(
          new NextRequest(
            `http://localhost:3000/api/media/${mediaBody.media.mediaAssetId as string}/inspect`,
            {
              method: "POST",
              headers: { Cookie: publisherCookie, Origin: "http://localhost:3000" },
            },
          ),
          mediaInspectionContext,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await mediaThumbnailRoute(
          new NextRequest(
            `http://localhost:3000/api/media/${mediaBody.media.mediaAssetId as string}/thumbnail`,
            {
              method: "POST",
              headers: { Cookie: publisherCookie, Origin: "http://localhost:3000" },
            },
          ),
          {
            params: Promise.resolve({ mediaAssetId: mediaBody.media.mediaAssetId as string }),
          } as RouteContext<"/api/media/[mediaAssetId]/thumbnail">,
        )
      ).status,
    ).toBe(403);
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: workspaceA, userId: userA } },
      data: { roleId: role.id },
    });
    await prisma.dataset.delete({ where: { id: datasetCreateBody.dataset.datasetId } });
    expect(await prisma.publishJob.count()).toBe(publishJobCountBefore);
    const ingestedMedia = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: mediaBody.media.mediaAssetId },
    });
    expect(ingestedMedia.workspaceId).toBe(workspaceA);
    expect(ingestedMedia.status).toBe("REJECTED");
    expect(ingestedMedia.validationErrorCode).toBe("PROBE_INVALID_MEDIA");
    expect(ingestedMedia.storageKey).toMatch(/^original\/workspace\//u);
    await getStorageProvider().delete(ingestedMedia.storageKey);
    await prisma.mediaAsset.delete({ where: { id: ingestedMedia.id } });

    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: workspaceA, userId: userA } },
      data: { status: "SUSPENDED" },
    });
    await expect(auth.resolveContext(selectedSession, workspaceA)).rejects.toBeInstanceOf(
      AuthorizationDeniedError,
    );
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: workspaceA, userId: userA } },
      data: { status: "ACTIVE" },
    });

    expect(await auth.logout({ session: selectedSession, metadata, requestId: id() })).toBe(true);
    expect(await auth.authenticate(selected.material.rawToken)).toBeNull();

    const expiring = await auth.login(
      { email: "user-a@example.test", password: passwordA },
      metadata,
      id(),
    );
    currentTime = new Date(expiring.material.expiresAt.getTime());
    expect(await auth.authenticate(expiring.material.rawToken)).toBeNull();
    currentTime = new Date(now);

    const revocable = await auth.login(
      { email: "user-a@example.test", password: passwordA },
      metadata,
      id(),
    );
    const activeContext = await auth.resolveContext(revocable.session, workspaceA);
    const workspaceBSession = await auth.login(
      { email: "user-b@example.test", password: passwordB },
      metadata,
      id(),
    );
    await expect(
      auth.revokeAllSessions({
        actor: activeContext,
        targetUserId: userB,
        metadata,
        requestId: id(),
      }),
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
    expect(await auth.authenticate(workspaceBSession.material.rawToken)).not.toBeNull();
    expect(
      await auth.revokeAllSessions({
        actor: activeContext,
        targetUserId: userA,
        metadata,
        requestId: id(),
      }),
    ).toBeGreaterThan(0);
    expect(await auth.authenticate(revocable.material.rawToken)).toBeNull();

    await prisma.user.update({ where: { id: userA }, data: { status: "SUSPENDED" } });
    const suspendedRawToken = "a".repeat(43);
    const suspendedToken = await prisma.userSession.create({
      data: {
        id: id(),
        userId: userA,
        tokenHash: Uint8Array.from(hashSessionToken(suspendedRawToken)),
        expiresAt: new Date(now.getTime() + 60_000),
        lastSeenAt: now,
      },
    });
    expect(suspendedToken.userId).toBe(userA);
    expect(await auth.authenticate(suspendedRawToken)).toBeNull();

    const auditActions = await prisma.auditLog.findMany({
      where: { actorId: { in: [userA, bootstrapped.userId] } },
      select: { action: true },
    });
    const recordedActions = new Set(auditActions.map(({ action }) => action));
    for (const action of [
      "SUPER_ADMIN_BOOTSTRAPPED",
      "AUTH_LOGIN_SUCCESS",
      "AUTH_LOGIN_FAILURE",
      "WORKSPACE_SELECTED",
      "AUTHORIZATION_DENIED",
      "AUTH_LOGOUT",
      "SESSION_REVOKED",
    ])
      expect(recordedActions).toContain(action);
    expect(await prisma.userCredential.count({ where: { passwordHash: passwordA } })).toBe(0);
  });
});
