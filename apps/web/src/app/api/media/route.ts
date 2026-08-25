import { getAppConfig } from "@otshop/config";
import { InvalidMediaError } from "@/application/media/media-errors";
import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import {
  declaredRequestLength,
  encodedMediaFilename,
  requestChunks,
  validateIdentityEncoding,
} from "@/infrastructure/http/streaming-media-request";
import { requireMediaRouteContext } from "@/infrastructure/media/route-context";
import { getMediaIngestService } from "@/infrastructure/media/runtime";

export const runtime = "nodejs";

export const POST = withApiHandler(async (request, { requestId }) => {
  requireSameOrigin(request);
  const context = await requireMediaRouteContext({
    request,
    requestId,
    permission: "media.upload",
  });
  const config = getAppConfig();
  declaredRequestLength(request, config.maxMediaUploadBytes);
  validateIdentityEncoding(request);
  if (request.body === null) throw new InvalidMediaError();
  const result = await getMediaIngestService().ingest({
    context,
    requestId,
    originalFilename: encodedMediaFilename(request),
    declaredMimeType: request.headers.get("content-type") ?? "",
    source: requestChunks(request.body),
  });
  return Response.json(
    { media: result },
    {
      status: result.duplicate ? 200 : 201,
      headers: { "Cache-Control": "no-store" },
    },
  );
});
