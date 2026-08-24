import { getAppConfig } from "@otshop/config";
import type { NextRequest, NextResponse } from "next/server";

import type { SessionMaterial } from "@/application/auth/session-token";

export const SESSION_COOKIE_NAME = "otshop_session";
export const WORKSPACE_COOKIE_NAME = "otshop_workspace";

const isLoopback = (hostname: string): boolean =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

export function sessionCookieIsSecure(
  requestUrl: string,
  nodeEnv: "development" | "production" | "test" = getAppConfig().nodeEnv,
): boolean {
  const url = new URL(requestUrl);
  return nodeEnv === "production" || !isLoopback(url.hostname);
}

const baseOptions = (requestUrl: string) => ({
  httpOnly: true,
  secure: sessionCookieIsSecure(requestUrl),
  sameSite: "lax" as const,
  path: "/",
  priority: "high" as const,
});

export function setSessionCookies(
  response: NextResponse,
  request: NextRequest,
  material: SessionMaterial,
  workspaceId?: string,
): void {
  response.cookies.set(SESSION_COOKIE_NAME, material.rawToken, {
    ...baseOptions(request.url),
    expires: material.expiresAt,
  });
  if (workspaceId !== undefined) {
    response.cookies.set(WORKSPACE_COOKIE_NAME, workspaceId, {
      ...baseOptions(request.url),
      expires: material.expiresAt,
    });
  }
}

export function clearAuthCookies(response: NextResponse, request: NextRequest): void {
  for (const name of [SESSION_COOKIE_NAME, WORKSPACE_COOKIE_NAME]) {
    response.cookies.set(name, "", { ...baseOptions(request.url), maxAge: 0 });
  }
}

export function clearWorkspaceCookie(response: NextResponse, request: NextRequest): void {
  response.cookies.set(WORKSPACE_COOKIE_NAME, "", { ...baseOptions(request.url), maxAge: 0 });
}
