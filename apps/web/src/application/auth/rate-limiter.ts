import { createHash } from "node:crypto";

interface AttemptWindow {
  count: number;
  resetAt: number;
}

export interface LoginRateLimiter {
  isAllowed(email: string, ipPrefix: string | undefined, now: Date): boolean;
  registerFailure(email: string, ipPrefix: string | undefined, now: Date): void;
  reset(email: string, ipPrefix: string | undefined): void;
}

const MAX_FAILURES = 5;
const WINDOW_MS = 60_000;

const digest = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("base64url");

export class LocalLoginRateLimiter implements LoginRateLimiter {
  private readonly attempts = new Map<string, AttemptWindow>();

  private key(email: string, ipPrefix: string | undefined): string {
    return `${digest(email)}:${digest(ipPrefix ?? "unknown")}`;
  }

  isAllowed(email: string, ipPrefix: string | undefined, now: Date): boolean {
    const key = this.key(email, ipPrefix);
    const window = this.attempts.get(key);
    if (window === undefined || now.getTime() >= window.resetAt) {
      this.attempts.delete(key);
      return true;
    }
    return window.count < MAX_FAILURES;
  }

  registerFailure(email: string, ipPrefix: string | undefined, now: Date): void {
    const key = this.key(email, ipPrefix);
    const existing = this.attempts.get(key);
    if (existing === undefined || now.getTime() >= existing.resetAt) {
      this.attempts.set(key, { count: 1, resetAt: now.getTime() + WINDOW_MS });
      return;
    }
    existing.count += 1;
  }

  reset(email: string, ipPrefix: string | undefined): void {
    this.attempts.delete(this.key(email, ipPrefix));
  }
}
