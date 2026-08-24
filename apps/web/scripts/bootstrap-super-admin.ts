import { AuthenticationRepository, disconnectDatabaseClient } from "@otshop/database";

import { Argon2idPasswordHasher } from "../src/application/auth/password";
import {
  BootstrapInputSchema,
  SuperAdminBootstrapService,
} from "../src/application/auth/bootstrap-service";

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
    throw new Error(
      "Usage: set OTSHOP_BOOTSTRAP_PASSWORD, then run with --email and --display-name; password must be 12+ characters with upper, lower, number, and symbol",
    );
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
    (error.name === "BootstrapAlreadyCompletedError" || error.message.startsWith("Usage:"))
      ? error.message
      : "Bootstrap failed safely; no administrator was created";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await disconnectDatabaseClient();
}
