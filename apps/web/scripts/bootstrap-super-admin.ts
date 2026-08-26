import {
  AuthenticationRepository,
  disconnectDatabaseClient,
  inspectDeveloperAccessDatabase,
} from "@otshop/database";

import { Argon2idPasswordHasher } from "../src/application/auth/password";
import {
  BootstrapInputSchema,
  SuperAdminBootstrapService,
} from "../src/application/auth/bootstrap-service";
import {
  databaseUrlConfiguration,
  diagnosticAdvice,
  requiredMigrationNames,
} from "./developer-access-cli";

class BootstrapCliError extends Error {
  override readonly name = "BootstrapCliError";
}

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

async function main(): Promise<void> {
  const parsed = BootstrapInputSchema.safeParse({
    email: argument("--email"),
    displayName: argument("--display-name"),
    password: process.env.OTSHOP_BOOTSTRAP_PASSWORD,
  });
  if (!parsed.success) {
    throw new BootstrapCliError(
      "INVALID_BOOTSTRAP_INPUT: set OTSHOP_BOOTSTRAP_PASSWORD, then provide --email and --display-name; the password must be 12+ characters with upper, lower, number, and symbol",
    );
  }

  const databaseUrl = databaseUrlConfiguration(process.env.DATABASE_URL);
  if (databaseUrl !== "DATABASE_URL_READY") {
    throw new BootstrapCliError(`${databaseUrl}: ${diagnosticAdvice(databaseUrl)}`);
  }
  const preflight = await inspectDeveloperAccessDatabase({
    requiredMigrations: await requiredMigrationNames(),
  });
  if (preflight.code === "READY_FOR_LOGIN") {
    throw new BootstrapCliError(
      "SUPER_ADMIN_ALREADY_EXISTS: bootstrap is one-time; sign in or use the documented recovery process",
    );
  }
  if (preflight.code !== "READY_FOR_BOOTSTRAP") {
    throw new BootstrapCliError(`${preflight.code}: ${diagnosticAdvice(preflight.code)}`);
  }

  const service = new SuperAdminBootstrapService(
    new AuthenticationRepository(),
    new Argon2idPasswordHasher(),
  );
  await service.bootstrap(parsed.data);
  process.stdout.write(
    "Initial SUPER_ADMIN created successfully. Clear OTSHOP_BOOTSTRAP_PASSWORD.\n",
  );
}

try {
  await main();
} catch (error) {
  const message =
    error instanceof Error &&
    (error.name === "BootstrapAlreadyCompletedError" || error.name === "BootstrapCliError")
      ? error.message
      : "BOOTSTRAP_PERSISTENCE_FAILED: bootstrap failed safely; no administrator was created";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await disconnectDatabaseClient();
}
