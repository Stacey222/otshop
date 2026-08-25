import { MEDIA_BATCH_MAX_METADATA_BYTES } from "@otshop/shared";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";
import { getMediaImportBatchService } from "@/infrastructure/media-batches/runtime";

export const runtime = "nodejs";

export const POST = withApiHandler(async (request, { requestId }) => {
  requireSameOrigin(request);
  const context = await requireRouteContext({ request, requestId, permission: "media.upload" });
  const batch = await getMediaImportBatchService().create({
    context,
    requestId,
    body: await readBoundedJson(request, MEDIA_BATCH_MAX_METADATA_BYTES),
  });
  return Response.json({ batch }, { status: 201, headers: { "Cache-Control": "no-store" } });
});
