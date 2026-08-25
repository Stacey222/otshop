import type { FeatureFlags } from "@otshop/shared";
import { z } from "zod";

import { ConfigurationError, type ConfigurationIssue } from "./configuration-error";
import { parseFeatureFlags, type EnvironmentSource } from "./feature-flags";

export const logLevels = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof logLevels)[number];

export interface AppConfig {
  readonly appUrl: string;
  readonly appVersion: string;
  readonly databaseUrl: string | null;
  readonly ffmpegExecutable: string;
  readonly ffmpegMaxDiagnosticBytes: number;
  readonly ffmpegThumbnailTimeoutMs: number;
  readonly ffprobeExecutable: string;
  readonly ffprobeMaxOutputBytes: number;
  readonly ffprobeTimeoutMs: number;
  readonly features: FeatureFlags;
  readonly logLevel: LogLevel;
  readonly maxMediaUploadBytes: number;
  readonly mediaBatchMaxConcurrency: number;
  readonly mediaBatchMaxFiles: number;
  readonly mediaBatchMaxTotalBytes: number;
  readonly nodeEnv: "development" | "production" | "test";
  readonly storageRoot: string;
  readonly thumbnailMaxBytes: number;
  readonly thumbnailMaxDimension: number;
}

const usesProtocol = (value: string, allowedProtocols: ReadonlyArray<string>): boolean => {
  try {
    return allowedProtocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const appUrlSchema = z
  .string()
  .url()
  .refine((value) => usesProtocol(value, ["http:", "https:"]), "Expected an HTTP(S) URL");

const databaseUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => usesProtocol(value, ["postgres:", "postgresql:"]),
    "Expected a PostgreSQL URL",
  );

const environmentSchema = z.object({
  APP_URL: appUrlSchema.default("http://localhost:3000"),
  APP_VERSION: z.string().min(1).default("0.0.0"),
  DATABASE_URL: databaseUrlSchema.optional(),
  FFMPEG_EXECUTABLE: z.string().trim().min(1).max(1_024).default("ffmpeg"),
  FFMPEG_MAX_DIAGNOSTIC_BYTES: z.coerce.number().int().min(4_096).max(4_194_304).default(262_144),
  FFMPEG_THUMBNAIL_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
  FFPROBE_EXECUTABLE: z.string().trim().min(1).max(1_024).default("ffprobe"),
  FFPROBE_MAX_OUTPUT_BYTES: z.coerce.number().int().min(4_096).max(4_194_304).default(262_144),
  FFPROBE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
  LOG_LEVEL: z.enum(logLevels).default("info"),
  MAX_MEDIA_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .default(268_435_456),
  MEDIA_BATCH_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(2).default(2),
  MEDIA_BATCH_MAX_FILES: z.coerce.number().int().min(1).max(25).default(25),
  MEDIA_BATCH_MAX_TOTAL_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(1_073_741_824)
    .default(1_073_741_824),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  STORAGE_ROOT: z.string().min(1).default("./storage"),
  THUMBNAIL_MAX_BYTES: z.coerce.number().int().min(16_384).max(16_777_216).default(1_048_576),
  THUMBNAIL_MAX_DIMENSION: z.coerce.number().int().min(64).max(4_096).default(640),
});

const toConfigurationIssues = (issues: z.core.$ZodIssue[]): ConfigurationIssue[] =>
  issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join("."),
  }));

const assertUnavailableFeaturesAreDisabled = (features: FeatureFlags): void => {
  const unavailable: string[] = [];

  if (features.shopeeAndroidEnabled) {
    unavailable.push("ENABLE_SHOPEE_ANDROID");
  }

  if (features.shopeeOfficialApiEnabled) {
    unavailable.push("ENABLE_SHOPEE_OFFICIAL_API");
  }

  if (features.realPublishEnabled) {
    unavailable.push("ENABLE_REAL_PUBLISH");
  }

  if (features.workerRealPublishAllowed) {
    unavailable.push("ALLOW_REAL_PUBLISH");
  }

  if (unavailable.length > 0) {
    throw new ConfigurationError(
      unavailable.map((path) => ({
        message: "This integration is not implemented and must remain disabled",
        path,
      })),
    );
  }
};

export const parseAppConfig = (source: EnvironmentSource): AppConfig => {
  const environmentResult = environmentSchema.safeParse(source);

  if (!environmentResult.success) {
    throw new ConfigurationError(toConfigurationIssues(environmentResult.error.issues));
  }

  const features = parseFeatureFlags(source);
  assertUnavailableFeaturesAreDisabled(features);

  return {
    appUrl: environmentResult.data.APP_URL,
    appVersion: environmentResult.data.APP_VERSION,
    databaseUrl: environmentResult.data.DATABASE_URL ?? null,
    ffmpegExecutable: environmentResult.data.FFMPEG_EXECUTABLE,
    ffmpegMaxDiagnosticBytes: environmentResult.data.FFMPEG_MAX_DIAGNOSTIC_BYTES,
    ffmpegThumbnailTimeoutMs: environmentResult.data.FFMPEG_THUMBNAIL_TIMEOUT_MS,
    ffprobeExecutable: environmentResult.data.FFPROBE_EXECUTABLE,
    ffprobeMaxOutputBytes: environmentResult.data.FFPROBE_MAX_OUTPUT_BYTES,
    ffprobeTimeoutMs: environmentResult.data.FFPROBE_TIMEOUT_MS,
    features,
    logLevel: environmentResult.data.LOG_LEVEL,
    maxMediaUploadBytes: environmentResult.data.MAX_MEDIA_UPLOAD_BYTES,
    mediaBatchMaxConcurrency: environmentResult.data.MEDIA_BATCH_MAX_CONCURRENCY,
    mediaBatchMaxFiles: environmentResult.data.MEDIA_BATCH_MAX_FILES,
    mediaBatchMaxTotalBytes: environmentResult.data.MEDIA_BATCH_MAX_TOTAL_BYTES,
    nodeEnv: environmentResult.data.NODE_ENV,
    storageRoot: environmentResult.data.STORAGE_ROOT,
    thumbnailMaxBytes: environmentResult.data.THUMBNAIL_MAX_BYTES,
    thumbnailMaxDimension: environmentResult.data.THUMBNAIL_MAX_DIMENSION,
  };
};

let cachedConfig: AppConfig | undefined;

export const getAppConfig = (): AppConfig => {
  cachedConfig ??= parseAppConfig(process.env);
  return cachedConfig;
};
