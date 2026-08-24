import type { DestinationStream } from "pino";
import { describe, expect, it } from "vitest";

import { createApplicationLogger } from "./logger";

describe("structured application logger", () => {
  it("emits correlation context while recursively redacting auth material", () => {
    const lines: string[] = [];
    const stream: DestinationStream = { write: (line) => lines.push(line) };
    const log = createApplicationLogger("info", stream).withContext({
      requestId: "018f0000-0000-7000-8000-000000000000",
      route: "/api/auth/session",
    });

    log.info("http.request.completed", {
      nested: { accessToken: "raw-token", safe: "kept" },
      status: 200,
    });

    const record = JSON.parse(lines.join("")) as Record<string, unknown>;
    expect(record).toMatchObject({
      requestId: "018f0000-0000-7000-8000-000000000000",
      route: "/api/auth/session",
      status: 200,
      msg: "http.request.completed",
      nested: { accessToken: "[REDACTED]", safe: "kept" },
    });
    expect(lines.join("")).not.toContain("raw-token");
  });
});
