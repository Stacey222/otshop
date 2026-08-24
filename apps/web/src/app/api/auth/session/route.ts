import { ROLE_PERMISSIONS } from "@otshop/shared";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, WORKSPACE_COOKIE_NAME } from "@/infrastructure/auth/cookies";
import { getAuthenticationService } from "@/infrastructure/auth/runtime";
import { withApiHandler } from "@/infrastructure/http/api-handler";

export const GET = withApiHandler(async (request: NextRequest): Promise<NextResponse> => {
  const auth = getAuthenticationService();
  const session = await auth.requireAuthentication(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const workspaceHint = request.cookies.get(WORKSPACE_COOKIE_NAME)?.value;
  const context = await auth.resolveContext(session, workspaceHint).catch(() => null);
  const systemPermissions = session.systemRoles.includes("SUPER_ADMIN")
    ? ROLE_PERMISSIONS.SUPER_ADMIN
    : [];
  return NextResponse.json(
    {
      user: { email: session.email, displayName: session.displayName },
      currentWorkspace:
        context === null
          ? null
          : { id: context.workspaceId, role: context.role, permissions: context.permissions },
      systemRoles: session.systemRoles,
      systemPermissions,
      expiresAt: session.expiresAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
