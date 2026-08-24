import type { HealthResponse } from "@otshop/shared";

export const getHealthResponse = (): HealthResponse => ({
  service: "control-plane",
  status: "ok",
});
