import { describe, expect, it } from "vitest";

import { LocalLoginRateLimiter } from "./rate-limiter";

describe("local authentication rate limiter", () => {
  it("bounds repeated failures by hashed account and IP keys", () => {
    const limiter = new LocalLoginRateLimiter();
    const now = new Date("2026-08-24T10:00:00.000Z");
    for (let count = 0; count < 5; count += 1) {
      expect(limiter.isAllowed("user@example.test", "127.0.0.0/24", now)).toBe(true);
      limiter.registerFailure("user@example.test", "127.0.0.0/24", now);
    }
    expect(limiter.isAllowed("user@example.test", "127.0.0.0/24", now)).toBe(false);
    expect(
      limiter.isAllowed("user@example.test", "127.0.0.0/24", new Date(now.getTime() + 60_000)),
    ).toBe(true);
  });
});
