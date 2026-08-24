import "server-only";

import type { AuthenticatedContext, Permission, RequestId } from "@otshop/shared";
import { cache } from "react";
import { cookies, headers } from "next/headers";

import { AuthorizationDeniedError, WorkspaceRequiredError } from "@/application/auth/auth-errors";
import {
  requestMetadataFromHeaders,
  type AuthRequestMetadata,
} from "@/application/auth/request-metadata";
import type {
  AuthenticatedSession,
  WorkspaceSummary,
} from "@/application/auth/authentication-service";
import { logger } from "@/infrastructure/logging/logger";
import { INTERNAL_REQUEST_ID_HEADER, trustedRequestId } from "@/infrastructure/http/request-id";

import { SESSION_COOKIE_NAME, WORKSPACE_COOKIE_NAME } from "./cookies";
import { getAuthenticationService } from "./runtime";

interface PageRequestContext {
  readonly metadata: AuthRequestMetadata;
  readonly requestId: RequestId;
}

export type AuthenticatedPageState = Readonly<{
  context: AuthenticatedContext | null;
  request: PageRequestContext;
  session: AuthenticatedSession;
  workspace: WorkspaceSummary | null;
}>;

export type PageAuthenticationResult =
  | Readonly<{ status: "authenticated"; value: AuthenticatedPageState }>
  | Readonly<{ requestId: RequestId; status: "unavailable" }>
  | Readonly<{ status: "unauthenticated" }>;

export const getPageAuthentication = cache(async (): Promise<PageAuthenticationResult> => {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const requestId = trustedRequestId(requestHeaders.get(INTERNAL_REQUEST_ID_HEADER));
  const metadata = requestMetadataFromHeaders(requestHeaders);
  const auth = getAuthenticationService();

  try {
    const session = await auth.authenticate(cookieStore.get(SESSION_COOKIE_NAME)?.value);
    if (session === null) return { status: "unauthenticated" };

    const workspaceHint = cookieStore.get(WORKSPACE_COOKIE_NAME)?.value;
    let context: AuthenticatedContext | null = null;
    try {
      context = await auth.resolveContext(session, workspaceHint);
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "";
      if (!(
        error instanceof AuthorizationDeniedError ||
        error instanceof WorkspaceRequiredError ||
        errorName === "AuthorizationDeniedError" ||
        errorName === "WorkspaceRequiredError"
      )) {
        throw error;
      }
    }
    const workspaces = context === null ? [] : await auth.listWorkspaces(session);
    const workspace =
      context === null ? null : (workspaces.find(({ id }) => id === context.workspaceId) ?? null);
    return {
      status: "authenticated",
      value: { context, request: { metadata, requestId }, session, workspace },
    };
  } catch (error) {
    logger.error("page.authentication.unavailable", {
      requestId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { status: "unavailable", requestId };
  }
});

export async function requirePagePermission(
  state: AuthenticatedPageState,
  permission: Permission,
): Promise<AuthenticatedContext> {
  return getAuthenticationService().requirePermission({
    session: state.session,
    workspaceId: state.context?.workspaceId,
    permission,
    requestId: state.request.requestId,
    metadata: state.request.metadata,
  });
}
