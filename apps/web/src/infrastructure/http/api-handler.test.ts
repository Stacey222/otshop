import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import type { ApplicationLogger } from "@/infrastructure/logging/logger";

import { withApiHandler } from "./api-handler";
import { INTERNAL_REQUEST_ID_HEADER, PUBLIC_REQUEST_ID_HEADER } from "./request-id";

describe("API request wrapper", () => {
  it("places the request ID in safe responses and structured completion logs", async () => {
    const records: Array<Record<string, unknown>> = [];
    const createLogger = (bound: Record<string, unknown> = {}): ApplicationLogger => ({
      debug: (message, context = {}) => records.push({ ...bound, ...context, message }),
      error: (message, context = {}) => records.push({ ...bound, ...context, message }),
      info: (message, context = {}) => records.push({ ...bound, ...context, message }),
      warn: (message, context = {}) => records.push({ ...bound, ...context, message }),
      withContext: (context) => createLogger({ ...bound, ...context }),
    });
    const requestId = "018f0000-0000-7000-8000-000000000000";
    const handler = withApiHandler(() => Response.json({ ok: true }), createLogger());
    const response = await handler(
      new NextRequest("http://localhost:3000/api/example", {
        headers: { [INTERNAL_REQUEST_ID_HEADER]: requestId },
      }),
    );

    expect(response.headers.get(PUBLIC_REQUEST_ID_HEADER)).toBe(requestId);
    expect(records).toContainEqual(
      expect.objectContaining({
        requestId,
        route: "/api/example",
        status: 200,
        message: "http.request.completed",
      }),
    );
  });
});
