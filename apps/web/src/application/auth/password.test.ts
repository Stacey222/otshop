import argon2 from "argon2";
import { describe, expect, it } from "vitest";

import { Argon2idPasswordHasher } from "./password";

describe("Argon2id password hashing", () => {
  it("stores an encoded Argon2id hash and verifies without exposing plaintext", async () => {
    const passwords = new Argon2idPasswordHasher();
    const encoded = await passwords.hash("Correct Horse Battery Staple!7");
    expect(encoded).toMatch(/^\$argon2id\$/u);
    expect(encoded).not.toContain("Correct Horse");
    await expect(passwords.verify(encoded, "Correct Horse Battery Staple!7")).resolves.toEqual({
      valid: true,
      needsUpgrade: false,
    });
    await expect(passwords.verify(encoded, "wrong password")).resolves.toEqual({
      valid: false,
      needsUpgrade: false,
    });
  });

  it("detects hashes whose parameters should be upgraded", async () => {
    const passwords = new Argon2idPasswordHasher();
    const weaker = await argon2.hash("Upgrade Me!7", {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    await expect(passwords.verify(weaker, "Upgrade Me!7")).resolves.toEqual({
      valid: true,
      needsUpgrade: true,
    });
  });
});
