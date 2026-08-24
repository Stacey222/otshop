import { describe, expect, it } from "vitest";

import { ConfigurationError } from "./configuration-error";
import { parseFeatureFlags } from "./feature-flags";

describe("parseFeatureFlags", () => {
  it("defaults every missing flag to false", () => {
    expect(parseFeatureFlags({})).toEqual({
      realPublishEnabled: false,
      schedulerEnabled: false,
      shopeeAndroidEnabled: false,
      shopeeOfficialApiEnabled: false,
      workerProtocolEnabled: false,
      workerRealPublishAllowed: false,
    });
  });

  it("parses the exact false value as false", () => {
    expect(parseFeatureFlags({ ENABLE_SCHEDULER: "false" }).schedulerEnabled).toBe(false);
  });

  it("parses the exact true value as true", () => {
    expect(parseFeatureFlags({ ENABLE_SCHEDULER: "true" }).schedulerEnabled).toBe(true);
  });

  it.each(["TRUE", "1", "yes", " false "])("rejects malformed boolean %s", (value) => {
    expect(() => parseFeatureFlags({ ENABLE_SCHEDULER: value })).toThrow(ConfigurationError);
  });
});
