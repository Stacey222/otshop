import { PROJECT_MAX_METADATA_BYTES } from "@otshop/shared";
import type { NextRequest } from "next/server";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";
import { getProjectService } from "@/infrastructure/projects/runtime";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  routeContext: RouteContext<"/api/projects/[projectId]">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "projects.read",
    });
    const { projectId } = await routeContext.params;
    const project = await getProjectService().get({ context, projectId });
    return Response.json({ project }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}

export async function PATCH(
  request: NextRequest,
  routeContext: RouteContext<"/api/projects/[projectId]">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "projects.write",
    });
    const { projectId } = await routeContext.params;
    const project = await getProjectService().update({
      context,
      requestId,
      projectId,
      body: await readBoundedJson(canonicalRequest, PROJECT_MAX_METADATA_BYTES),
    });
    return Response.json({ project }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}
