export interface ReadinessResult {
  readonly body: {
    readonly service: "control-plane";
    readonly status: "ready" | "unavailable";
  };
  readonly httpStatus: 200 | 503;
}

export async function getReadinessResult(
  databaseConfigured: boolean,
  databaseProbe: () => Promise<boolean>,
): Promise<ReadinessResult> {
  let ready = false;
  if (databaseConfigured) {
    try {
      ready = await databaseProbe();
    } catch {
      ready = false;
    }
  }

  return ready
    ? { body: { service: "control-plane", status: "ready" }, httpStatus: 200 }
    : { body: { service: "control-plane", status: "unavailable" }, httpStatus: 503 };
}
