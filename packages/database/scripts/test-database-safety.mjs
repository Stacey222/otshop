const forbiddenDatabaseNames = new Set(["postgres", "template0", "template1"]);

export function requireSafeTestDatabaseUrl(environment = process.env) {
  if (environment.NODE_ENV !== "test") {
    throw new Error("Database integration commands require NODE_ENV=test");
  }

  const rawUrl = environment.TEST_DATABASE_URL;
  if (rawUrl === undefined || rawUrl.trim() === "") {
    throw new Error("TEST_DATABASE_URL is required for database integration commands");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("TEST_DATABASE_URL must use the PostgreSQL protocol");
  }

  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  const schemaName = parsed.searchParams.get("schema");
  const explicitlyTestNamed =
    databaseName.endsWith("_test") || schemaName?.endsWith("_test") === true;

  if (databaseName === "" || forbiddenDatabaseNames.has(databaseName) || !explicitlyTestNamed) {
    throw new Error("TEST_DATABASE_URL must target a database or schema whose name ends in _test");
  }

  return rawUrl;
}
