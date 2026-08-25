import { CONFIGURATION_MAX_BODY_BYTES } from "@otshop/shared";
import type { NextRequest } from "next/server";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { getShopeeAccountService } from "@/infrastructure/accounts/runtime";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";

export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  routeContext: RouteContext<"/api/shopee-accounts/[accountId]/archive">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "accounts.manage",
    });
    const { accountId } = await routeContext.params;
    const account = await getShopeeAccountService().archive({
      context,
      requestId,
      accountId,
      body: await readBoundedJson(canonicalRequest, CONFIGURATION_MAX_BODY_BYTES),
    });
    return Response.json({ account }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}
