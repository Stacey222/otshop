import {
  ApplicationErrorShapeSchema,
  createApiErrorEnvelope,
  type ApplicationErrorShape,
  type RequestId,
} from "@otshop/shared";
import { NextResponse } from "next/server";

import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  InvalidCredentialsError,
  WorkspaceRequiredError,
} from "@/application/auth/auth-errors";
import { InvalidRequestOriginError } from "@/infrastructure/auth/csrf";

import { PUBLIC_REQUEST_ID_HEADER } from "./request-id";

export interface SafeHttpError {
  readonly body: ApplicationErrorShape;
  readonly status: number;
}

export function mapErrorToSafeHttp(error: unknown): SafeHttpError {
  let status = 500;
  let body: ApplicationErrorShape = {
    category: "NON_RETRYABLE",
    code: "INTERNAL_ERROR",
    message: "The request could not be completed",
    retryable: false,
    safeMetadata: {},
  };

  const errorName = error instanceof Error ? error.name : "";
  const applicationError =
    typeof error === "object" && error !== null
      ? ApplicationErrorShapeSchema.safeParse({
          category: Reflect.get(error, "category"),
          code: Reflect.get(error, "code"),
          message: Reflect.get(error, "message"),
          retryable: Reflect.get(error, "retryable"),
          safeMetadata: Reflect.get(error, "safeMetadata"),
        })
      : null;

  if (applicationError?.success === true) {
    status = applicationError.data.retryable ? 503 : 400;
    body = applicationError.data;
  } else if (error instanceof InvalidCredentialsError || errorName === "InvalidCredentialsError") {
    status = 401;
    body = { ...body, code: "AUTH_INVALID_CREDENTIALS", message: "Invalid email or password" };
  } else if (
    error instanceof AuthenticationRequiredError ||
    errorName === "AuthenticationRequiredError"
  ) {
    status = 401;
    body = { ...body, code: "AUTH_REQUIRED", message: "Authentication required" };
  } else if (
    error instanceof AuthorizationDeniedError ||
    errorName === "AuthorizationDeniedError"
  ) {
    status = 403;
    body = {
      ...body,
      code: "AUTHORIZATION_DENIED",
      message: "You are not authorized to perform this action",
    };
  } else if (error instanceof WorkspaceRequiredError || errorName === "WorkspaceRequiredError") {
    status = 409;
    body = { ...body, code: "WORKSPACE_REQUIRED", message: "Select an active workspace" };
  } else if (
    error instanceof InvalidRequestOriginError ||
    errorName === "InvalidRequestOriginError"
  ) {
    status = 403;
    body = {
      ...body,
      code: "INVALID_REQUEST_ORIGIN",
      message: "Request origin is not allowed",
    };
  } else if (
    error instanceof SyntaxError ||
    (error instanceof Error && error.name === "ZodError")
  ) {
    status = 400;
    body = { ...body, code: "INVALID_REQUEST", message: "The request payload is invalid" };
  }

  return { body, status };
}

export function errorResponse(error: unknown, id: RequestId): NextResponse {
  const mapped = mapErrorToSafeHttp(error);
  return NextResponse.json(createApiErrorEnvelope(mapped.body, id), {
    status: mapped.status,
    headers: { "Cache-Control": "no-store", [PUBLIC_REQUEST_ID_HEADER]: id },
  });
}
