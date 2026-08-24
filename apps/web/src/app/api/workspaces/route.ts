import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/infrastructure/auth/cookies";
import { getAuthenticationService } from "@/infrastructure/auth/runtime";
import { withApiHandler } from "@/infrastructure/http/api-handler";

export const GET = withApiHandler(async (request: NextRequest): Promise<NextResponse> => {
  const auth = getAuthenticationService();
  const session = await auth.requireAuthentication(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  return NextResponse.json(
    { workspaces: await auth.listWorkspaces(session) },
    { headers: { "Cache-Control": "no-store" } },
  );
});
