import { describe, expect, it } from "vitest";

import { parseAppConfig } from "./app-config";
import { ConfigurationError } from "./configuration-error";

describe("parseAppConfig", () => {
  it("provides runnable safe development defaults", () => {
    const config = parseAppConfig({});

    expect(config.nodeEnv).toBe("development");
    expect(config.appUrl).toBe("http://localhost:3000");
    expect(config.databaseUrl).toBeNull();
    expect(config.ffprobeExecutable).toBe("ffprobe");
    expect(config.ffprobeMaxOutputBytes).toBe(262_144);
    expect(config.ffprobeTimeoutMs).toBe(15_000);
    expect(config.maxMediaUploadBytes).toBe(268_435_456);
    expect(config.features.realPublishEnabled).toBe(false);
  });

  it("parses a bounded positive media upload limit", () => {
    expect(parseAppConfig({ MAX_MEDIA_UPLOAD_BYTES: "1048576" }).maxMediaUploadBytes).toBe(
      1_048_576,
    );
    expect(() => parseAppConfig({ MAX_MEDIA_UPLOAD_BYTES: "0" })).toThrow(ConfigurationError);
    expect(() => parseAppConfig({ MAX_MEDIA_UPLOAD_BYTES: "not-a-number" })).toThrow(
      ConfigurationError,
    );
  });

  it("parses bounded FFprobe process configuration", () => {
    const config = parseAppConfig({
      FFPROBE_EXECUTABLE: "C:\\tools\\ffprobe.exe",
      FFPROBE_MAX_OUTPUT_BYTES: "65536",
      FFPROBE_TIMEOUT_MS: "5000",
    });
    expect(config.ffprobeExecutable).toBe("C:\\tools\\ffprobe.exe");
    expect(config.ffprobeMaxOutputBytes).toBe(65_536);
    expect(config.ffprobeTimeoutMs).toBe(5_000);
    expect(() => parseAppConfig({ FFPROBE_MAX_OUTPUT_BYTES: "100" })).toThrow(ConfigurationError);
    expect(() => parseAppConfig({ FFPROBE_TIMEOUT_MS: "0" })).toThrow(ConfigurationError);
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
