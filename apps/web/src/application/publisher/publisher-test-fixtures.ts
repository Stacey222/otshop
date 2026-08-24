import {
  AuthenticatedContextSchema,
  PublishRequestSchema,
  RequestIdSchema,
  ROLE_PERMISSIONS,
  WorkspaceIdSchema,
  type AuthenticatedContext,
  type PublishRequest,
  type Role,
} from "@otshop/shared";

export const testWorkspaceId = WorkspaceIdSchema.parse("018f0000-0000-7000-8000-000000000001");
export const otherWorkspaceId = WorkspaceIdSchema.parse("018f0000-0000-7000-8000-000000000002");
export const testRequestId = RequestIdSchema.parse("018f0000-0000-7000-8000-000000000003");

export function publisherTestRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return PublishRequestSchema.parse({
    requestId: testRequestId,
    idempotencyKey: "a".repeat(64),
    workspaceId: testWorkspaceId,
    jobId: "018f0000-0000-7000-8000-000000000004",
    attemptId: "018f0000-0000-7000-8000-000000000005",
    account: {
      accountId: "018f0000-0000-7000-8000-000000000006",
      expectedDisplayName: "Mock account",
      countryCode: "ID",
    },
    media: {
      assetId: "018f0000-0000-7000-8000-000000000007",
      storageKey: "original/mock-video.mp4",
      sha256Hex: "b".repeat(64),
      mimeType: "video/mp4",
      sizeBytes: 1024,
    },
    caption: null,
    products: [],
    mode: "MOCK",
    deadlineAt: "2030-01-01T00:00:00.000Z",
    ...overrides,
  });
}

export function publisherTestContext(role: Role = "ADMIN"): AuthenticatedContext {
  return AuthenticatedContextSchema.parse({
    userId: "018f0000-0000-7000-8000-000000000008",
    sessionId: "018f0000-0000-7000-8000-000000000009",
    workspaceId: testWorkspaceId,
    role,
    permissions: ROLE_PERMISSIONS[role],
  });
}
