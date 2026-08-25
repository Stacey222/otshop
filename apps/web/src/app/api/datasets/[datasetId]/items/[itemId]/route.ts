import type { NextRequest } from "next/server";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { getDatasetService } from "@/infrastructure/datasets/runtime";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  routeContext: RouteContext<"/api/datasets/[datasetId]/items/[itemId]">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "datasets.write",
    });
    const { datasetId, itemId } = await routeContext.params;
    const result = await getDatasetService().updateItem({
      context,
      requestId,
      datasetId,
      itemId,
      body: await readBoundedJson(canonicalRequest),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  })(request);
}

export async function DELETE(
  request: NextRequest,
  routeContext: RouteContext<"/api/datasets/[datasetId]/items/[itemId]">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "datasets.write",
    });
    const { datasetId, itemId } = await routeContext.params;
    const dataset = await getDatasetService().removeItem({
      context,
      requestId,
      datasetId,
      itemId,
      body: await readBoundedJson(canonicalRequest),
    });
    return Response.json({ dataset }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}
