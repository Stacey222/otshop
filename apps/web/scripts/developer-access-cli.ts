import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const migrationsDirectory = new URL(
  "../../../packages/database/prisma/migrations/",
  import.meta.url,
);

export const databaseUrlConfiguration = (
  value: string | undefined,
): "DATABASE_URL_INVALID" | "DATABASE_URL_MISSING" | "DATABASE_URL_READY" => {
  if (value === undefined || value.trim().length === 0) return "DATABASE_URL_MISSING";
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) &&
      url.hostname.length > 0 &&
      url.pathname.length > 1
      ? "DATABASE_URL_READY"
      : "DATABASE_URL_INVALID";
  } catch {
    return "DATABASE_URL_INVALID";
  }
};

export const applicationUrlConfiguration = (
  value: string | undefined,
): "APP_URL_INVALID" | "APP_URL_READY" => {
  try {
    const url = new URL(value ?? "http://localhost:3000");
    return ["http:", "https:"].includes(url.protocol) &&
      url.hostname.length > 0 &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
      ? "APP_URL_READY"
      : "APP_URL_INVALID";
  } catch {
    return "APP_URL_INVALID";
  }
};

export const requiredMigrationNames = async (): Promise<readonly string[]> =>
  (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d+_/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();

export const executableAvailable = async (executable: string): Promise<boolean> => {
  try {
    await executeFile(executable, ["-version"], {
      encoding: "utf8",
      maxBuffer: 65_536,
      timeout: 5_000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
};

export const diagnosticAdvice = (code: string): string => {
  const advice: Readonly<Record<string, string>> = {
    APP_URL_INVALID: "Set APP_URL to the HTTP(S) origin used by the local browser.",
    APP_URL_READY: "configured origin is syntactically valid.",
    DATABASE_AUTH_FAILED:
      "Verify the dedicated database username/password and its access to the selected database.",
    DATABASE_SCHEMA_NOT_READY: "Run pnpm db:migrate:deploy with this DATABASE_URL.",
    DATABASE_UNREACHABLE: "Start the configured PostgreSQL service and verify its host and port.",
    DATABASE_URL_INVALID: "Set DATABASE_URL to a syntactically valid PostgreSQL database URL.",
    DATABASE_URL_MISSING: "Set DATABASE_URL in this PowerShell session before database commands.",
    FFMPEG_UNAVAILABLE: "Install FFmpeg or set FFMPEG_EXECUTABLE to an available executable.",
    FFPROBE_UNAVAILABLE: "Install FFprobe or set FFPROBE_EXECUTABLE to an available executable.",
    READY_FOR_BOOTSTRAP: "Run pnpm auth:bootstrap with an operator-chosen password.",
    READY_FOR_LOGIN: "Start the app and sign in with the operator-defined administrator email.",
  };
  return advice[code] ?? "Review the local developer setup documentation.";
};
