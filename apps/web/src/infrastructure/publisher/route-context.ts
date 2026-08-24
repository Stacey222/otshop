import type { Permission, RequestId } from "@otshop/shared";
import type { NextRequest } from "next/server";

import { requestMetadata } from "@/application/auth/request-metadata";
import { SESSION_COOKIE_NAME, WORKSPACE_COOKIE_NAME } from "@/infrastructure/auth/cookies";
import { getAuthenticationService } from "@/infrastructure/auth/runtime";

export async function requirePublisherRouteContext(input: {
  readonly permission: Permission;
  readonly request: NextRequest;
  readonly requestId: RequestId;
}) {
  const auth = getAuthenticationService();
  const session = await auth.requireAuthentication(
    input.request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
  return auth.requirePermission({
    session,
    workspaceId: input.request.cookies.get(WORKSPACE_COOKIE_NAME)?.value,
    permission: input.permission,
    requestId: input.requestId,
    metadata: requestMetadata(input.request),
  });
}
