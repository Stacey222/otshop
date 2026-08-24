import { getHealthResponse } from "@/application/health";
import { withApiHandler } from "@/infrastructure/http/api-handler";

export const dynamic = "force-dynamic";

export const GET = withApiHandler(() =>
  Response.json(getHealthResponse(), {
    headers: {
      "Cache-Control": "no-store",
    },
  }),
);
