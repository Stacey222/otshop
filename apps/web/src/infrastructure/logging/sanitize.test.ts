import { describe, expect, it } from "vitest";

import { sanitizeLogContext } from "./sanitize";

describe("sanitizeLogContext", () => {
  it("redacts sensitive keys at nested levels", () => {
    expect(
      sanitizeLogContext({
        authorizationHeader: "Bearer private-value",
        databaseUrl: "postgresql://private",
        nested: {
          accessToken: "access-private",
          api_key: "api-private",
          clientSecret: "client-private",
          cookieHeader: "session=private",
          passphrase: "private words",
          passwordConfirmation: "private-password",
          privateKey: "private-key-material",
          refresh_token: "refresh-private",
          sessionCookie: "session-private",
          "set-cookie": "session=private",
          otp: "123456",
          safe: "visible",
        },
      }),
    ).toEqual({
      authorizationHeader: "[REDACTED]",
      databaseUrl: "[REDACTED]",
      nested: {
        accessToken: "[REDACTED]",
        api_key: "[REDACTED]",
        clientSecret: "[REDACTED]",
        cookieHeader: "[REDACTED]",
        passphrase: "[REDACTED]",
        passwordConfirmation: "[REDACTED]",
        privateKey: "[REDACTED]",
        refresh_token: "[REDACTED]",
        sessionCookie: "[REDACTED]",
        "set-cookie": "[REDACTED]",
        otp: "[REDACTED]",
        safe: "visible",
      },
    });
  });

  it("preserves harmless operational and business keys", () => {
    expect(
      sanitizeLogContext({
        requestId: "018f0000-0000-7000-8000-000000000000",
        route: "/dashboard",
        status: 200,
        workspaceId: "018f0000-0000-7000-8000-000000000001",
        keyboardLayout: "QWERTY",
        monkeySpecies: "macaque",
      }),
    ).toEqual({
      requestId: "018f0000-0000-7000-8000-000000000000",
      route: "/dashboard",
      status: 200,
      workspaceId: "018f0000-0000-7000-8000-000000000001",
      keyboardLayout: "QWERTY",
      monkeySpecies: "macaque",
    });
  });

  it("handles circular input without throwing", () => {
    const context: Record<string, unknown> = {};
    context.self = context;

    expect(sanitizeLogContext(context)).toEqual({ self: "[CIRCULAR]" });
  });
});
