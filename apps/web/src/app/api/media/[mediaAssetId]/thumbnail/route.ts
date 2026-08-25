import type { NextRequest } from "next/server";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { requireMediaRouteContext } from "@/infrastructure/media/route-context";
import { getMediaThumbnailService } from "@/infrastructure/media/runtime";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  routeContext: RouteContext<"/api/media/[mediaAssetId]/thumbnail">,
): Promise<Response> {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireMediaRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "media.upload",
    });
    const { mediaAssetId } = await routeContext.params;
    const result = await getMediaThumbnailService().generate({
      context,
      requestId,
      mediaAssetId,
    });
    return Response.json(
      { thumbnail: result },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  })(request);
}
