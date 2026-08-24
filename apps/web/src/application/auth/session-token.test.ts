import { describe, expect, it } from "vitest";

import { UserSessionIdSchema } from "@otshop/shared";

import {
  SESSION_TOKEN_BYTES,
  createSessionMaterial,
  hashSessionToken,
  isPlausibleSessionToken,
} from "./session-token";

describe("database session token material", () => {
  it("creates a 256-bit bearer token and persists only its deterministic hash", () => {
    const material = createSessionMaterial(new Date("2026-08-24T10:00:00.000Z"));
    expect(Buffer.from(material.rawToken, "base64url")).toHaveLength(SESSION_TOKEN_BYTES);
    expect(isPlausibleSessionToken(material.rawToken)).toBe(true);
    expect(material.tokenHash).toEqual(hashSessionToken(material.rawToken));
    expect(Buffer.from(material.tokenHash).toString("utf8")).not.toContain(material.rawToken);
    expect(UserSessionIdSchema.parse(material.id)).toBe(material.id);
  });

  it.each(["", "tampered!", "a".repeat(42), "a".repeat(44)])(
    "rejects malformed bearer material: %s",
    (token) => expect(isPlausibleSessionToken(token)).toBe(false),
  );
});
