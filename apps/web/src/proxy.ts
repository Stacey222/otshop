import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/infrastructure/logging/logger";
import {
  INTERNAL_REQUEST_ID_HEADER,
  PUBLIC_REQUEST_ID_HEADER,
  createRequestId,
} from "@/infrastructure/http/request-id";

export function proxy(request: NextRequest): NextResponse {
  // Browser-supplied correlation IDs are deliberately replaced at the trust boundary.
  const requestId = createRequestId();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(PUBLIC_REQUEST_ID_HEADER);
  requestHeaders.set(INTERNAL_REQUEST_ID_HEADER, requestId);

  logger.info("http.request.received", {
    requestId,
    method: request.method,
    route: request.nextUrl.pathname,
  });

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(PUBLIC_REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
