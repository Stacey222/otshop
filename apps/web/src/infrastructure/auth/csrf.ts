import { getAppConfig } from "@otshop/config";

export class InvalidRequestOriginError extends Error {
  override readonly name = "InvalidRequestOriginError";
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  let parsedOrigin: string | undefined;
  try {
    parsedOrigin = origin === null ? undefined : new URL(origin).origin;
  } catch {
    parsedOrigin = undefined;
  }
  if (parsedOrigin !== new URL(getAppConfig().appUrl).origin) {
    throw new InvalidRequestOriginError("Request origin is not allowed");
  }
}
