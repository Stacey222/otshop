import type { RequestId } from "@otshop/shared";
import type { NextRequest } from "next/server";

import { logger, type ApplicationLogger } from "@/infrastructure/logging/logger";

import { errorResponse, mapErrorToSafeHttp } from "./api-response";
import { PUBLIC_REQUEST_ID_HEADER, requestIdFrom } from "./request-id";

export interface ApiRequestContext {
  readonly log: ApplicationLogger;
  readonly requestId: RequestId;
}

type ApiRouteHandler = (
  request: NextRequest,
  context: ApiRequestContext,
) => Promise<Response> | Response;

export function withApiHandler(
  handler: ApiRouteHandler,
  baseLogger: ApplicationLogger = logger,
): (request: NextRequest) => Promise<Response> {
  return async (request) => {
    const startedAt = performance.now();
    const requestId = requestIdFrom(request);
    const route = new URL(request.url).pathname;
    const log = baseLogger.withContext({ requestId, method: request.method, route });

    try {
      const response = await handler(request, { log, requestId });
      response.headers.set(PUBLIC_REQUEST_ID_HEADER, requestId);
      response.headers.set("Cache-Control", response.headers.get("Cache-Control") ?? "no-store");
      log.info("http.request.completed", {
        durationMs: Math.round(performance.now() - startedAt),
        status: response.status,
      });
      return response;
    } catch (error) {
      const mapped = mapErrorToSafeHttp(error);
      log.error("http.request.failed", {
        code: mapped.body.code,
        durationMs: Math.round(performance.now() - startedAt),
        errorType: error instanceof Error ? error.name : typeof error,
        status: mapped.status,
      });
      return errorResponse(error, requestId);
    }
  };
}
