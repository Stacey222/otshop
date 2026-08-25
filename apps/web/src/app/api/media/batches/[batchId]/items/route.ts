import { getAppConfig } from "@otshop/config";
import type { NextRequest } from "next/server";

import { InvalidMediaError } from "@/application/media/media-errors";
import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import {
  declaredRequestLength,
  encodedMediaFilename,
  requestChunks,
  validateIdentityEncoding,
} from "@/infrastructure/http/streaming-media-request";
import { getMediaImportBatchService } from "@/infrastructure/media-batches/runtime";

export const runtime = "nodejs";

const integerHeader = (request: NextRequest, name: string): number => {
  const value = request.headers.get(name);
  if (value === null || !/^[0-9]+$/u.test(value)) throw new InvalidMediaError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new InvalidMediaError();
  return parsed;
};

export async function POST(
  request: NextRequest,
  routeContext: RouteContext<"/api/media/batches/[batchId]/items">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "media.upload",
    });
    const config = getAppConfig();
    const declaredBytes = declaredRequestLength(canonicalRequest, config.maxMediaUploadBytes, true);
    validateIdentityEncoding(canonicalRequest);
    if (canonicalRequest.body === null || declaredBytes === null) throw new InvalidMediaError();
    const { batchId } = await routeContext.params;
    const batch = await getMediaImportBatchService().uploadItem({
      context,
      requestId,
      batchId,
      expectedVersion: integerHeader(canonicalRequest, "x-batch-version"),
      inputIndex: integerHeader(canonicalRequest, "x-batch-input-index"),
      originalFilename: encodedMediaFilename(canonicalRequest),
      declaredMimeType: canonicalRequest.headers.get("content-type") ?? "",
      declaredBytes,
      source: requestChunks(canonicalRequest.body),
    });
    return Response.json({ batch }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}
