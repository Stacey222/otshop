import { LoginRequestSchema } from "@otshop/shared";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requestMetadata } from "@/application/auth/request-metadata";
import { clearWorkspaceCookie, setSessionCookies } from "@/infrastructure/auth/cookies";
import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { getAuthenticationService } from "@/infrastructure/auth/runtime";
import { withApiHandler } from "@/infrastructure/http/api-handler";

export const POST = withApiHandler(
  async (request: NextRequest, { requestId }): Promise<NextResponse> => {
    requireSameOrigin(request);
    const input = LoginRequestSchema.parse(await request.json());
    const result = await getAuthenticationService().login(
      input,
      requestMetadata(request),
      requestId,
    );
    const response = NextResponse.json(
      { user: { displayName: result.session.displayName }, expiresAt: result.material.expiresAt },
      { headers: { "Cache-Control": "no-store" } },
    );
    clearWorkspaceCookie(response, request);
    setSessionCookies(response, request, result.material);
    return response;
  },
);
