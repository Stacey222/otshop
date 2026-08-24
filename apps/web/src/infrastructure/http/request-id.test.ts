import { RequestIdSchema } from "@otshop/shared";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

import { PUBLIC_REQUEST_ID_HEADER, trustedRequestId } from "./request-id";

const generated = "018f0000-0000-7000-8000-000000000001";

describe("request correlation IDs", () => {
  it("generates a bounded canonical ID when the trusted header is missing", () => {
    expect(trustedRequestId(null, () => generated)).toBe(generated);
  });

  it("replaces malformed trusted values", () => {
    expect(trustedRequestId("../../unsafe\nvalue", () => generated)).toBe(generated);
  });

  it("replaces even well-formed browser-supplied IDs at the proxy boundary", () => {
    const browserValue = "018f0000-0000-7000-8000-000000000002";
    const response = proxy(
      new NextRequest("http://localhost:3000/dashboard", {
        headers: { [PUBLIC_REQUEST_ID_HEADER]: browserValue },
      }),
    );
    const requestId = response.headers.get(PUBLIC_REQUEST_ID_HEADER);
    expect(RequestIdSchema.safeParse(requestId).success).toBe(true);
    expect(requestId).not.toBe(browserValue);
  });
});
