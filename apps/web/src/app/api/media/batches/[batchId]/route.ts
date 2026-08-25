import type { NextRequest } from "next/server";

import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { getMediaImportBatchService } from "@/infrastructure/media-batches/runtime";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  routeContext: RouteContext<"/api/media/batches/[batchId]">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "media.upload",
    });
    const { batchId } = await routeContext.params;
    const limit = canonicalRequest.nextUrl.searchParams.get("limit") ?? undefined;
    const cursor = canonicalRequest.nextUrl.searchParams.get("cursor") ?? undefined;
    const batch = await getMediaImportBatchService().get({
      context,
      batchId,
      ...(limit === undefined ? {} : { limit }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    return Response.json({ batch }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}
