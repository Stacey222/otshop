import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { getDatasetService } from "@/infrastructure/datasets/runtime";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";

export const runtime = "nodejs";

export const GET = withApiHandler(async (request, { requestId }) => {
  const context = await requireRouteContext({ request, requestId, permission: "datasets.read" });
  const limit = request.nextUrl.searchParams.get("limit") ?? undefined;
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const includeArchived = request.nextUrl.searchParams.get("includeArchived") ?? undefined;
  const result = await getDatasetService().list({
    context,
    ...(limit === undefined ? {} : { limit }),
    ...(cursor === undefined ? {} : { cursor }),
    ...(includeArchived === undefined ? {} : { includeArchived }),
  });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withApiHandler(async (request, { requestId }) => {
  requireSameOrigin(request);
  const context = await requireRouteContext({ request, requestId, permission: "datasets.write" });
  const dataset = await getDatasetService().create({
    context,
    requestId,
    body: await readBoundedJson(request),
  });
  return Response.json({ dataset }, { status: 201, headers: { "Cache-Control": "no-store" } });
});
