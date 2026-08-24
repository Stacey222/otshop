import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requestMetadata } from "@/application/auth/request-metadata";
import { SESSION_COOKIE_NAME, clearAuthCookies } from "@/infrastructure/auth/cookies";
import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { getAuthenticationService } from "@/infrastructure/auth/runtime";
import { withApiHandler } from "@/infrastructure/http/api-handler";

export const POST = withApiHandler(
  async (request: NextRequest, { requestId }): Promise<NextResponse> => {
    requireSameOrigin(request);
    const auth = getAuthenticationService();
    const session = await auth.authenticate(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    if (session !== null) {
      await auth.logout({ session, metadata: requestMetadata(request), requestId });
    }
    const response = new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
    clearAuthCookies(response, request);
    return response;
  },
);
