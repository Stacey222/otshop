import { PROJECT_MAX_METADATA_BYTES } from "@otshop/shared";
import type { NextRequest } from "next/server";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";
import { getProjectItemProductService } from "@/infrastructure/projects/project-item-runtime";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  routeContext: RouteContext<"/api/projects/[projectId]/items/product/bulk">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "projects.write",
    });
    const { projectId } = await routeContext.params;
    const productAssignment = await getProjectItemProductService().assignAll({
      context,
      requestId,
      projectId,
      body: await readBoundedJson(canonicalRequest, PROJECT_MAX_METADATA_BYTES),
    });
    return Response.json({ productAssignment }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}
