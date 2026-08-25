import { PROJECT_MAX_METADATA_BYTES } from "@otshop/shared";
import type { NextRequest } from "next/server";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";
import { getProjectService } from "@/infrastructure/projects/runtime";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  routeContext: RouteContext<"/api/projects/[projectId]/archive">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "projects.write",
    });
    const { projectId } = await routeContext.params;
    const project = await getProjectService().archive({
      context,
      requestId,
      projectId,
      body: await readBoundedJson(canonicalRequest, PROJECT_MAX_METADATA_BYTES),
    });
    return Response.json({ project }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}
