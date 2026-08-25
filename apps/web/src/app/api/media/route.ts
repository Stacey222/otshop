import { getAppConfig } from "@otshop/config";
import type { NextRequest } from "next/server";

import {
  InvalidMediaError,
  InvalidMediaFilenameError,
  MediaTooLargeError,
} from "@/application/media/media-errors";
import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { requireMediaRouteContext } from "@/infrastructure/media/route-context";
import { getMediaIngestService } from "@/infrastructure/media/runtime";

export const runtime = "nodejs";

const encodedFilename = (request: NextRequest): string => {
  const value = request.headers.get("x-media-filename");
  if (value === null || value.length === 0 || value.length > 800) {
    throw new InvalidMediaFilenameError();
  }
  try {
    return decodeURIComponent(value);
  } catch {
    throw new InvalidMediaFilenameError();
  }
};

const validateLength = (request: NextRequest, maximum: number): void => {
  const value = request.headers.get("content-length");
  if (value === null) return;
  if (!/^[0-9]+$/u.test(value)) throw new InvalidMediaError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new MediaTooLargeError();
  if (parsed > maximum) throw new MediaTooLargeError();
};

const requestChunks = (body: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> => ({
  async *[Symbol.asyncIterator]() {
    const reader = body.getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) return;
        yield next.value;
      }
    } finally {
      reader.releaseLock();
    }
  },
});

export const POST = withApiHandler(async (request, { requestId }) => {
  requireSameOrigin(request);
  const context = await requireMediaRouteContext({
    request,
    requestId,
    permission: "media.upload",
  });
  const config = getAppConfig();
  validateLength(request, config.maxMediaUploadBytes);
  const contentEncoding = request.headers.get("content-encoding");
  if (contentEncoding !== null && contentEncoding.toLowerCase() !== "identity") {
    throw new InvalidMediaError();
  }
  if (request.body === null) throw new InvalidMediaError();
  const result = await getMediaIngestService().ingest({
    context,
    requestId,
    originalFilename: encodedFilename(request),
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
