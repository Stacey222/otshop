import { z } from "zod";

import { CONFIGURATION_DEFAULT_PAGE_SIZE, CONFIGURATION_MAX_PAGE_SIZE } from "@otshop/shared";

export const encodeConfigurationCursor = (value: object): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

export const parseConfigurationPageSize = (
  value: string | undefined,
  invalid: () => Error,
): number => {
  if (value === undefined) return CONFIGURATION_DEFAULT_PAGE_SIZE;
  if (!/^[1-9][0-9]*$/u.test(value)) throw invalid();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > CONFIGURATION_MAX_PAGE_SIZE) throw invalid();
  return parsed;
};

export const decodeConfigurationCursor = <T>(
  value: string | undefined,
  schema: z.ZodType<T>,
  invalid: () => Error,
): T | undefined => {
  if (value === undefined) return undefined;
  if (value.length === 0 || value.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw invalid();
  try {
    return schema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw invalid();
  }
};
