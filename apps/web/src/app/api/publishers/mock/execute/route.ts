import type { NextRequest } from "next/server";

import { MockPublisherExecutionInputSchema } from "@/application/publisher/publisher-api";
import { requireSameOrigin } from "@/infrastructure/auth/csrf";
import { withApiHandler } from "@/infrastructure/http/api-handler";
import { requirePublisherRouteContext } from "@/infrastructure/publisher/route-context";
import { getPublisherService } from "@/infrastructure/publisher/runtime";

export const POST = withApiHandler(async (request: NextRequest, { requestId }) => {
  requireSameOrigin(request);
  const context = await requirePublisherRouteContext({
    request,
    requestId,
    permission: "projects.run",
  });
  const input = MockPublisherExecutionInputSchema.parse(await request.json());
  return Response.json(
    {
      result: await getPublisherService().executeMock({
        context,
        request: input.request,
        requestId,
        scenario: input.scenario,
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
