import { RequestIdSchema, createUuidV7, type RequestId } from "@otshop/shared";

export const INTERNAL_REQUEST_ID_HEADER = "x-otshop-request-id";
export const PUBLIC_REQUEST_ID_HEADER = "x-request-id";

export type RequestIdGenerator = () => string;

export function createRequestId(generate: RequestIdGenerator = createUuidV7): RequestId {
  return RequestIdSchema.parse(generate());
}

export function trustedRequestId(
  value: string | null,
  generate: RequestIdGenerator = createUuidV7,
): RequestId {
  const parsed = RequestIdSchema.safeParse(value);
  return parsed.success ? parsed.data : createRequestId(generate);
}

export function requestIdFrom(request: Request): RequestId {
  return trustedRequestId(request.headers.get(INTERNAL_REQUEST_ID_HEADER));
}
