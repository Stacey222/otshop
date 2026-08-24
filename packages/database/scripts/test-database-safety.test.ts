import { describe, expect, it } from "vitest";

import { requireSafeTestDatabaseUrl } from "./test-database-safety.mjs";

describe("test database safety", () => {
  it("accepts only an explicitly configured test target", () => {
    expect(
      requireSafeTestDatabaseUrl({
        NODE_ENV: "test",
        TEST_DATABASE_URL: "postgresql://test:placeholder@localhost:5432/otshop_test",
      }),
    ).toBe("postgresql://test:placeholder@localhost:5432/otshop_test");
    expect(
      requireSafeTestDatabaseUrl({
        NODE_ENV: "test",
        TEST_DATABASE_URL:
          "postgresql://test:placeholder@localhost:5432/otshop?schema=slice_23_test",
      }),
    ).toContain("schema=slice_23_test");
  });

  it.each([
    [{}, "NODE_ENV=test"],
    [
      { NODE_ENV: "production", TEST_DATABASE_URL: "postgresql://x:y@localhost/otshop_test" },
      "NODE_ENV=test",
    ],
    [{ NODE_ENV: "test" }, "TEST_DATABASE_URL is required"],
    [{ NODE_ENV: "test", TEST_DATABASE_URL: "not-a-url" }, "valid PostgreSQL URL"],
    [
      { NODE_ENV: "test", TEST_DATABASE_URL: "mysql://x:y@localhost/otshop_test" },
      "PostgreSQL protocol",
    ],
    [
      { NODE_ENV: "test", TEST_DATABASE_URL: "postgresql://x:y@localhost/postgres" },
      "ends in _test",
    ],
    [{ NODE_ENV: "test", TEST_DATABASE_URL: "postgresql://x:y@localhost/otshop" }, "ends in _test"],
  ])("rejects unsafe configuration %#", (environment, message) => {
    expect(() => requireSafeTestDatabaseUrl(environment)).toThrow(message);
  });
});
