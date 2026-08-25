import type { NextRequest } from "next/server";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { getDatasetService } from "@/infrastructure/datasets/runtime";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  routeContext: RouteContext<"/api/datasets/[datasetId]/reorder">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "datasets.write",
    });
    const { datasetId } = await routeContext.params;
    const result = await getDatasetService().reorder({
      context,
      requestId,
      datasetId,
      body: await readBoundedJson(canonicalRequest),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  })(request);
}
