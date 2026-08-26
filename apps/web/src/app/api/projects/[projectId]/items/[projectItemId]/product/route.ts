import { PROJECT_MAX_METADATA_BYTES } from "@otshop/shared";
import type { NextRequest } from "next/server";

import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { requireRouteContext } from "@/infrastructure/auth/route-context";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { readBoundedJson } from "@/infrastructure/http/json-body";
import { getProjectItemProductService } from "@/infrastructure/projects/project-item-runtime";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  routeContext: RouteContext<"/api/projects/[projectId]/items/[projectItemId]/product">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "projects.read",
    });
    const { projectId, projectItemId } = await routeContext.params;
    const productAssignment = await getProjectItemProductService().get({
      context,
      projectId,
      projectItemId,
    });
    return Response.json({ productAssignment }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}

export async function PUT(
  request: NextRequest,
  routeContext: RouteContext<"/api/projects/[projectId]/items/[projectItemId]/product">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "projects.write",
    });
    const { projectId, projectItemId } = await routeContext.params;
    const productAssignment = await getProjectItemProductService().assign({
      context,
      requestId,
      projectId,
      projectItemId,
      body: await readBoundedJson(canonicalRequest, PROJECT_MAX_METADATA_BYTES),
    });
    return Response.json({ productAssignment }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}

export async function DELETE(
  request: NextRequest,
  routeContext: RouteContext<"/api/projects/[projectId]/items/[projectItemId]/product">,
) {
  return withApiHandler(async (canonicalRequest, { requestId }) => {
    requireSameOrigin(canonicalRequest);
    const context = await requireRouteContext({
      request: canonicalRequest,
      requestId,
      permission: "projects.write",
    });
    const { projectId, projectItemId } = await routeContext.params;
    const productAssignment = await getProjectItemProductService().remove({
      context,
      requestId,
      projectId,
      projectItemId,
      body: await readBoundedJson(canonicalRequest, PROJECT_MAX_METADATA_BYTES),
    });
    return Response.json({ productAssignment }, { headers: { "Cache-Control": "no-store" } });
  })(request);
}
