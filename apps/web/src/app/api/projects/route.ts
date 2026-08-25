import { PROJECT_MAX_METADATA_BYTES } from "@otshop/shared";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";
import { getProjectService } from "@/infrastructure/projects/runtime";

export const runtime = "nodejs";

export const GET = withApiHandler(async (request, { requestId }) => {
  const context = await requireRouteContext({ request, requestId, permission: "projects.read" });
  const limit = request.nextUrl.searchParams.get("limit") ?? undefined;
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const includeArchived = request.nextUrl.searchParams.get("includeArchived") ?? undefined;
  const result = await getProjectService().list({
    context,
    ...(limit === undefined ? {} : { limit }),
    ...(cursor === undefined ? {} : { cursor }),
    ...(includeArchived === undefined ? {} : { includeArchived }),
  });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
});

export const POST = withApiHandler(async (request, { requestId }) => {
  requireSameOrigin(request);
  const context = await requireRouteContext({ request, requestId, permission: "projects.write" });
  const project = await getProjectService().create({
    context,
    requestId,
    body: await readBoundedJson(request, PROJECT_MAX_METADATA_BYTES),
  });
  return Response.json({ project }, { status: 201, headers: { "Cache-Control": "no-store" } });
});
