type SanitizedLogValue =
  | ReadonlyArray<SanitizedLogValue>
  | { readonly [key: string]: SanitizedLogValue }
  | boolean
  | null
  | number
  | string;

const redactedValue = "[REDACTED]";
const truncatedValue = "[TRUNCATED]";
const circularValue = "[CIRCULAR]";

const sensitiveKeyNames = [
  "accesstoken",
  "apikey",
  "authorization",
  "authorizationheader",
  "cookie",
  "cookieheader",
  "clientsecret",
  "databaseurl",
  "otp",
  "passphrase",
  "password",
  "passwordconfirm",
  "passwordconfirmation",
  "privatekey",
  "refreshtoken",
  "secret",
  "session",
  "sessioncookie",
  "setcookie",
  "token",
  "workerapisecret",
] as const;

const normalizeKey = (key: string): string => key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");

export const isSensitiveLogKey = (key: string): boolean => {
  const normalized = normalizeKey(key);
  return sensitiveKeyNames.some(
    (sensitiveName) => normalized === sensitiveName || normalized.endsWith(sensitiveName),
  );
};

const isSanitizedRecord = (
  value: SanitizedLogValue,
): value is { readonly [key: string]: SanitizedLogValue } =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const sanitizeValue = (value: unknown, seen: WeakSet<object>, depth: number): SanitizedLogValue => {
  if (depth > 8) {
    return truncatedValue;
  }

  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, seen, depth + 1));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return circularValue;
    }

    seen.add(value);
    const sanitized: Record<string, SanitizedLogValue> = {};

    for (const [key, entry] of Object.entries(value)) {
      sanitized[key] = isSensitiveLogKey(key)
        ? redactedValue
        : sanitizeValue(entry, seen, depth + 1);
    }

    return sanitized;
  }

  return String(value);
};

export const sanitizeLogContext = (
  context: Readonly<Record<string, unknown>>,
): Readonly<Record<string, SanitizedLogValue>> => {
  const sanitized = sanitizeValue(context, new WeakSet(), 0);

  if (!isSanitizedRecord(sanitized)) {
    return {};
  }

  return sanitized;
};
