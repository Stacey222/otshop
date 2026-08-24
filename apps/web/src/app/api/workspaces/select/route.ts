import { WorkspaceSelectionRequestSchema } from "@otshop/shared";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requestMetadata } from "@/application/auth/request-metadata";
import { SESSION_COOKIE_NAME, setSessionCookies } from "@/infrastructure/auth/cookies";
import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { getAuthenticationService } from "@/infrastructure/auth/runtime";
import { withApiHandler } from "@/infrastructure/http/api-handler";

export const POST = withApiHandler(
  async (request: NextRequest, { requestId }): Promise<NextResponse> => {
    requireSameOrigin(request);
    const auth = getAuthenticationService();
    const session = await auth.requireAuthentication(
      request.cookies.get(SESSION_COOKIE_NAME)?.value,
    );
    const selection = WorkspaceSelectionRequestSchema.parse(await request.json());
    const selected = await auth.selectWorkspace({
      session,
      workspaceId: selection.workspaceId,
      requestId,
      metadata: requestMetadata(request),
    });
    const response = NextResponse.json(
      { workspace: { role: selected.context.role, permissions: selected.context.permissions } },
      { headers: { "Cache-Control": "no-store" } },
    );
    setSessionCookies(response, request, selected.material, selected.context.workspaceId);
    return response;
  },
);
