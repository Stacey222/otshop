import { MEDIA_BATCH_MAX_METADATA_BYTES } from "@otshop/shared";
import type { NextRequest } from "next/server";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";
import { getMediaImportBatchService } from "@/infrastructure/media-batches/runtime";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  routeContext: RouteContext<"/api/media/batches/[batchId]/finalize">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "media.upload",
    });
    const { batchId } = await routeContext.params;
    const batch = await getMediaImportBatchService().finalize({
      context,
      requestId,
      batchId,
      body: await readBoundedJson(canonicalRequest, MEDIA_BATCH_MAX_METADATA_BYTES),
    });
    return Response.json({ batch }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}
