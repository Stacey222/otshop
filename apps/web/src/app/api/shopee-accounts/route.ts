import { CONFIGURATION_MAX_BODY_BYTES } from "@otshop/shared";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { getShopeeAccountService } from "@/infrastructure/accounts/runtime";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";

export const runtime = "nodejs";

export const GET = withApiHandler(async (request, { requestId }) => {
  const context = await requireRouteContext({ request, requestId, permission: "accounts.read" });
  const limit = request.nextUrl.searchParams.get("limit") ?? undefined;
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const includeArchived = request.nextUrl.searchParams.get("includeArchived") ?? undefined;
  const result = await getShopeeAccountService().list({
    context,
    ...(limit === undefined ? {} : { limit }),
    ...(cursor === undefined ? {} : { cursor }),
    ...(includeArchived === undefined ? {} : { includeArchived }),
  });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withApiHandler(async (request, { requestId }) => {
  requireSameOrigin(request);
  const context = await requireRouteContext({ request, requestId, permission: "accounts.manage" });
  const account = await getShopeeAccountService().create({
    context,
    requestId,
    body: await readBoundedJson(request, CONFIGURATION_MAX_BODY_BYTES),
  });
  return Response.json({ account }, { status: 201, headers: { "Cache-Control": "no-store" } });
});
