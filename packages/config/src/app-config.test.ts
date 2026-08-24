import { describe, expect, it } from "vitest";

import { parseAppConfig } from "./app-config";
import { ConfigurationError } from "./configuration-error";

describe("parseAppConfig", () => {
  it("provides runnable safe development defaults", () => {
    const config = parseAppConfig({});

    expect(config.nodeEnv).toBe("development");
    expect(config.appUrl).toBe("http://localhost:3000");
    expect(config.databaseUrl).toBeNull();
    expect(config.features.realPublishEnabled).toBe(false);
  });

  it("rejects malformed application URLs", () => {
    expect(() => parseAppConfig({ APP_URL: "not-a-url" })).toThrow(ConfigurationError);
  });

  it("accepts PostgreSQL URLs without exposing or connecting to them", () => {
    const databaseUrl = "postgresql://user:placeholder@localhost:5432/otshop";

    expect(parseAppConfig({ DATABASE_URL: databaseUrl }).databaseUrl).toBe(databaseUrl);
  });

  it("rejects non-PostgreSQL database URLs", () => {
    expect(() => parseAppConfig({ DATABASE_URL: "https://localhost/database" })).toThrow(
      ConfigurationError,
    );
  });

  it.each([
    "ENABLE_SHOPEE_ANDROID",
    "ENABLE_SHOPEE_OFFICIAL_API",
    "ENABLE_REAL_PUBLISH",
    "ALLOW_REAL_PUBLISH",
  ] as const)("fails closed when unavailable dangerous flag %s is true", (flag) => {
    expect(() => parseAppConfig({ [flag]: "true" })).toThrow(ConfigurationError);
  });

  it("allows non-dangerous foundation flags to be explicitly enabled", () => {
    const config = parseAppConfig({
      ENABLE_SCHEDULER: "true",
      ENABLE_WORKER_PROTOCOL: "true",
    });

    expect(config.features.schedulerEnabled).toBe(true);
    expect(config.features.workerProtocolEnabled).toBe(true);
  });
});
