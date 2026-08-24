import type { NextRequest } from "next/server";

import { withApiHandler } from "@/infrastructure/http/api-handler";
import { requirePublisherRouteContext } from "@/infrastructure/publisher/route-context";
import { getPublisherService } from "@/infrastructure/publisher/runtime";

export const GET = withApiHandler(async (request: NextRequest, { requestId }) => {
  const context = await requirePublisherRouteContext({
    request,
    requestId,
    permission: "workspace.read",
  });
  return Response.json(
    { publishers: getPublisherService().listPublishers(context) },
    { headers: { "Cache-Control": "no-store" } },
  );
});
