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
  readonly features: FeatureFlags;
  readonly logLevel: LogLevel;
  readonly nodeEnv: "development" | "production" | "test";
  readonly storageRoot: string;
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
  LOG_LEVEL: z.enum(logLevels).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  STORAGE_ROOT: z.string().min(1).default("./storage"),
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
    features,
    logLevel: environmentResult.data.LOG_LEVEL,
    nodeEnv: environmentResult.data.NODE_ENV,
    storageRoot: environmentResult.data.STORAGE_ROOT,
  };
};

let cachedConfig: AppConfig | undefined;

export const getAppConfig = (): AppConfig => {
  cachedConfig ??= parseAppConfig(process.env);
  return cachedConfig;
};
