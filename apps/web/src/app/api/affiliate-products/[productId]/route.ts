import { CONFIGURATION_MAX_BODY_BYTES } from "@otshop/shared";
import type { NextRequest } from "next/server";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";
import { getAffiliateProductService } from "@/infrastructure/products/runtime";

export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  routeContext: RouteContext<"/api/affiliate-products/[productId]">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "projects.read",
    });
    const { productId } = await routeContext.params;
    const product = await getAffiliateProductService().get({ context, productId });
    return Response.json({ product }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}
export async function PATCH(
  request: NextRequest,
  routeContext: RouteContext<"/api/affiliate-products/[productId]">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "projects.write",
    });
    const { productId } = await routeContext.params;
    const product = await getAffiliateProductService().update({
      context,
      requestId,
      productId,
      body: await readBoundedJson(canonicalRequest, CONFIGURATION_MAX_BODY_BYTES),
    });
    return Response.json({ product }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}
