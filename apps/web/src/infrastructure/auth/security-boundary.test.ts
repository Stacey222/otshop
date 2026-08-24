import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import { createSessionMaterial } from "../../application/auth/session-token";

import { SESSION_COOKIE_NAME, sessionCookieIsSecure, setSessionCookies } from "./cookies";
import { InvalidRequestOriginError, requireSameOrigin } from "./csrf";

describe("cookie and mutation security boundary", () => {
  it("sets an HttpOnly, SameSite=Lax, bounded session cookie", () => {
    const request = new NextRequest("http://localhost:3000/api/auth/login");
    const response = NextResponse.json({ ok: true });
    setSessionCookies(response, request, createSessionMaterial(new Date("2026-08-24T10:00:00Z")));
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Expires=");
  });

  it("requires Secure cookies in production and outside loopback", () => {
    expect(sessionCookieIsSecure("http://localhost:3000", "development")).toBe(false);
    expect(sessionCookieIsSecure("http://localhost:3000", "production")).toBe(true);
    expect(sessionCookieIsSecure("https://control.example.test", "development")).toBe(true);
  });

  it("accepts only the configured origin for cookie-authenticated mutations", () => {
    const accepted = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { Origin: "http://localhost:3000" },
    });
    expect(() => requireSameOrigin(accepted)).not.toThrow();
    for (const origin of [undefined, "https://evil.example.test", "not-a-url"]) {
      const rejected = new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
        ...(origin === undefined ? {} : { headers: { Origin: origin } }),
      });
      expect(() => requireSameOrigin(rejected)).toThrow(InvalidRequestOriginError);
    }
  });
});
