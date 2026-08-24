import { isDatabaseReady } from "@otshop/database";
import { getAppConfig } from "@otshop/config";

import { getReadinessResult } from "@/application/readiness";
import { withApiHandler } from "@/infrastructure/http/api-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withApiHandler(async (_request, { log }): Promise<Response> => {
  let databaseConfigured = false;
  try {
    databaseConfigured = getAppConfig().databaseUrl !== null;
  } catch {
    log.warn("readiness.configuration.unavailable");
  }
  const result = await getReadinessResult(databaseConfigured, isDatabaseReady);

  return Response.json(result.body, {
    headers: { "Cache-Control": "no-store" },
    status: result.httpStatus,
  });
});
