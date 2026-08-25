import { describe, expect, it } from "vitest";

import { parseAppConfig } from "./app-config";
import { ConfigurationError } from "./configuration-error";

describe("parseAppConfig", () => {
  it("provides runnable safe development defaults", () => {
    const config = parseAppConfig({});

    expect(config.nodeEnv).toBe("development");
    expect(config.appUrl).toBe("http://localhost:3000");
    expect(config.databaseUrl).toBeNull();
    expect(config.ffmpegExecutable).toBe("ffmpeg");
    expect(config.ffmpegMaxDiagnosticBytes).toBe(262_144);
    expect(config.ffmpegThumbnailTimeoutMs).toBe(15_000);
    expect(config.ffprobeExecutable).toBe("ffprobe");
    expect(config.ffprobeMaxOutputBytes).toBe(262_144);
    expect(config.ffprobeTimeoutMs).toBe(15_000);
    expect(config.maxMediaUploadBytes).toBe(268_435_456);
    expect(config.mediaBatchMaxFiles).toBe(25);
    expect(config.mediaBatchMaxTotalBytes).toBe(1_073_741_824);
    expect(config.mediaBatchMaxConcurrency).toBe(2);
    expect(config.thumbnailMaxBytes).toBe(1_048_576);
    expect(config.thumbnailMaxDimension).toBe(640);
    expect(config.features.realPublishEnabled).toBe(false);
  });

  it("parses conservative media batch limits", () => {
    const config = parseAppConfig({
      MEDIA_BATCH_MAX_FILES: "10",
      MEDIA_BATCH_MAX_TOTAL_BYTES: "1048576",
      MEDIA_BATCH_MAX_CONCURRENCY: "2",
    });
    expect(config.mediaBatchMaxFiles).toBe(10);
    expect(config.mediaBatchMaxTotalBytes).toBe(1_048_576);
    expect(config.mediaBatchMaxConcurrency).toBe(2);
    expect(() => parseAppConfig({ MEDIA_BATCH_MAX_FILES: "26" })).toThrow(ConfigurationError);
    expect(() => parseAppConfig({ MEDIA_BATCH_MAX_CONCURRENCY: "3" })).toThrow(ConfigurationError);
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

  it("parses bounded FFmpeg thumbnail configuration", () => {
    const config = parseAppConfig({
      FFMPEG_EXECUTABLE: "C:\\tools\\ffmpeg.exe",
      FFMPEG_MAX_DIAGNOSTIC_BYTES: "65536",
      FFMPEG_THUMBNAIL_TIMEOUT_MS: "5000",
      THUMBNAIL_MAX_BYTES: "524288",
      THUMBNAIL_MAX_DIMENSION: "480",
    });
    expect(config.ffmpegExecutable).toBe("C:\\tools\\ffmpeg.exe");
    expect(config.ffmpegMaxDiagnosticBytes).toBe(65_536);
    expect(config.ffmpegThumbnailTimeoutMs).toBe(5_000);
    expect(config.thumbnailMaxBytes).toBe(524_288);
    expect(config.thumbnailMaxDimension).toBe(480);
    expect(() => parseAppConfig({ FFMPEG_MAX_DIAGNOSTIC_BYTES: "100" })).toThrow(
      ConfigurationError,
    );
    expect(() => parseAppConfig({ FFMPEG_THUMBNAIL_TIMEOUT_MS: "0" })).toThrow(ConfigurationError);
    expect(() => parseAppConfig({ THUMBNAIL_MAX_BYTES: "100" })).toThrow(ConfigurationError);
    expect(() => parseAppConfig({ THUMBNAIL_MAX_DIMENSION: "32" })).toThrow(ConfigurationError);
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
