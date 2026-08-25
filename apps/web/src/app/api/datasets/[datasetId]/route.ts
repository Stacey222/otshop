import type { NextRequest } from "next/server";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { getDatasetService } from "@/infrastructure/datasets/runtime";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  routeContext: RouteContext<"/api/datasets/[datasetId]">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "datasets.read",
    });
    const { datasetId } = await routeContext.params;
    const itemLimit = canonicalRequest.nextUrl.searchParams.get("itemLimit") ?? undefined;
    const itemCursor = canonicalRequest.nextUrl.searchParams.get("itemCursor") ?? undefined;
    const dataset = await getDatasetService().get({
      context,
      datasetId,
      ...(itemLimit === undefined ? {} : { itemLimit }),
      ...(itemCursor === undefined ? {} : { itemCursor }),
    });
    return Response.json({ dataset }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}

export async function PATCH(
  request: NextRequest,
  routeContext: RouteContext<"/api/datasets/[datasetId]">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "datasets.write",
    });
    const { datasetId } = await routeContext.params;
    const dataset = await getDatasetService().update({
      context,
      requestId,
      datasetId,
      body: await readBoundedJson(canonicalRequest),
    });
    return Response.json({ dataset }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}
