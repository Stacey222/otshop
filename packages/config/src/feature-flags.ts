import type { FeatureFlags } from "@otshop/shared";
import { z } from "zod";

import { ConfigurationError, type ConfigurationIssue } from "./configuration-error";

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

const strictBoolean = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const featureFlagSchema = z.object({
  ALLOW_REAL_PUBLISH: strictBoolean,
  ENABLE_REAL_PUBLISH: strictBoolean,
  ENABLE_SCHEDULER: strictBoolean,
  ENABLE_SHOPEE_ANDROID: strictBoolean,
  ENABLE_SHOPEE_OFFICIAL_API: strictBoolean,
  ENABLE_WORKER_PROTOCOL: strictBoolean,
});

const toConfigurationIssues = (issues: z.core.$ZodIssue[]): ConfigurationIssue[] =>
  issues.map((issue) => ({
    message: issue.message,
    path: issue.path.join("."),
  }));

export const parseFeatureFlags = (source: EnvironmentSource): FeatureFlags => {
  const result = featureFlagSchema.safeParse(source);

  if (!result.success) {
    throw new ConfigurationError(toConfigurationIssues(result.error.issues));
  }

  return {
    realPublishEnabled: result.data.ENABLE_REAL_PUBLISH,
    schedulerEnabled: result.data.ENABLE_SCHEDULER,
    shopeeAndroidEnabled: result.data.ENABLE_SHOPEE_ANDROID,
    shopeeOfficialApiEnabled: result.data.ENABLE_SHOPEE_OFFICIAL_API,
    workerProtocolEnabled: result.data.ENABLE_WORKER_PROTOCOL,
    workerRealPublishAllowed: result.data.ALLOW_REAL_PUBLISH,
  };
};
