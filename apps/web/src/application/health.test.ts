import { describe, expect, it } from "vitest";

import { getHealthResponse } from "./health";

describe("getHealthResponse", () => {
  it("returns the safe liveness contract without external dependencies", () => {
    expect(getHealthResponse()).toEqual({
      service: "control-plane",
      status: "ok",
    });
  });
});
