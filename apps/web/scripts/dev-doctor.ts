import { disconnectDatabaseClient, inspectDeveloperAccessDatabase } from "@otshop/database";

import {
  applicationUrlConfiguration,
  databaseUrlConfiguration,
  diagnosticAdvice,
  executableAvailable,
  requiredMigrationNames,
} from "./developer-access-cli";

const report = (code: string, detail?: string): void => {
  process.stdout.write(`${code}: ${detail ?? diagnosticAdvice(code)}\n`);
};

async function main(): Promise<void> {
  let ready = true;
  const appUrl = applicationUrlConfiguration(process.env.APP_URL);
  report(appUrl);
  ready &&= appUrl === "APP_URL_READY";

  const ffmpegReady = await executableAvailable(process.env.FFMPEG_EXECUTABLE ?? "ffmpeg");
  report(
    ffmpegReady ? "FFMPEG_READY" : "FFMPEG_UNAVAILABLE",
    ffmpegReady ? "available" : undefined,
  );
  ready &&= ffmpegReady;
  const ffprobeReady = await executableAvailable(process.env.FFPROBE_EXECUTABLE ?? "ffprobe");
  report(
    ffprobeReady ? "FFPROBE_READY" : "FFPROBE_UNAVAILABLE",
    ffprobeReady ? "available" : undefined,
  );
  ready &&= ffprobeReady;

  const databaseUrl = databaseUrlConfiguration(process.env.DATABASE_URL);
  report(
    databaseUrl,
    databaseUrl === "DATABASE_URL_READY" ? "configured without disclosure" : undefined,
  );
  if (databaseUrl !== "DATABASE_URL_READY") {
    process.exitCode = 1;
    return;
  }

  const migrations = await requiredMigrationNames();
  const database = await inspectDeveloperAccessDatabase({ requiredMigrations: migrations });
  if (database.code === "DATABASE_SCHEMA_NOT_READY") {
    const suffix =
      database.missingMigrations === undefined
        ? undefined
        : `${database.missingMigrations.length} committed migration(s) are not applied. ${diagnosticAdvice(database.code)}`;
    report(database.code, suffix);
    process.exitCode = 1;
    return;
  }
  report(database.code);
  if (database.superAdminState !== undefined)
    report(database.superAdminState, "safe state confirmed");
  if (!ready || !database.code.startsWith("READY_FOR_")) process.exitCode = 1;
}

try {
  await main();
} catch {
  report("DATABASE_SCHEMA_NOT_READY");
  process.exitCode = 1;
} finally {
  await disconnectDatabaseClient();
}
