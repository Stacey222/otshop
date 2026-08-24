import { describe, expect, it } from "vitest";

import {
  AuthAuditActionSchema,
  LoginRequestSchema,
  MembershipStatusSchema,
  authAuditActions,
} from "./auth";

describe("authentication contracts", () => {
  it("normalizes email login identifiers without accepting arbitrary input", () => {
    expect(
      LoginRequestSchema.parse({ email: "  Operator@Example.COM ", password: "secret" }).email,
    ).toBe("operator@example.com");
    expect(LoginRequestSchema.safeParse({ email: "not-email", password: "secret" }).success).toBe(
      false,
    );
  });

  it("keeps minimum lifecycle and audit vocabularies closed", () => {
    expect(MembershipStatusSchema.safeParse("ACTIVE").success).toBe(true);
    expect(MembershipStatusSchema.safeParse("ENABLED").success).toBe(false);
    expect(authAuditActions.every((action) => AuthAuditActionSchema.parse(action) === action)).toBe(
      true,
    );
  });
});
