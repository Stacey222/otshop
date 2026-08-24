import { describe, expect, it } from "vitest";

import { securityHeaders } from "../../../next.config";

describe("baseline response security headers", () => {
  it("prevents MIME sniffing and framing while applying a tested static CSP", () => {
    const headers = Object.fromEntries(securityHeaders.map(({ key, value }) => [key, value]));
    expect(headers).toMatchObject({
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
  });
});
