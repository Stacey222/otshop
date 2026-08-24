import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const placeholderDatabaseUrl = "postgresql://otshop:placeholder@127.0.0.1:5432/otshop";
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const child = spawn(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? placeholderDatabaseUrl,
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  process.stderr.write(`Unable to launch Prisma: ${error.message}\n`);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
