import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { requireSafeTestDatabaseUrl } from "./test-database-safety.mjs";

let databaseUrl;
try {
  databaseUrl = requireSafeTestDatabaseUrl({ ...process.env, NODE_ENV: "test" });
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Unsafe test database configuration"}\n`,
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const vitestCli = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const child = spawn(
  process.execPath,
  [vitestCli, "run", "--config", "vitest.integration.config.ts"],
  {
    env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test" },
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  process.stderr.write(`Unable to launch database tests: ${error.message}\n`);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
