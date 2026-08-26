import { describe, expect, it } from "vitest";

import { applicationUrlConfiguration, databaseUrlConfiguration } from "./developer-access-cli";

describe("developer access CLI configuration diagnostics", () => {
  it("classifies database configuration without returning its contents", () => {
    expect(databaseUrlConfiguration(undefined)).toBe("DATABASE_URL_MISSING");
    expect(databaseUrlConfiguration("not-a-url")).toBe("DATABASE_URL_INVALID");
    expect(databaseUrlConfiguration("https://localhost/database")).toBe("DATABASE_URL_INVALID");
    expect(databaseUrlConfiguration("postgresql://user:secret@localhost/otshop")).toBe(
      "DATABASE_URL_READY",
    );
  });

  it("accepts only a usable HTTP(S) application origin", () => {
    expect(applicationUrlConfiguration(undefined)).toBe("APP_URL_READY");
    expect(applicationUrlConfiguration("http://localhost:3000")).toBe("APP_URL_READY");
    expect(applicationUrlConfiguration("file:///tmp/app")).toBe("APP_URL_INVALID");
    expect(applicationUrlConfiguration("https://user:secret@example.test/app")).toBe(
      "APP_URL_INVALID",
    );
  });
});
