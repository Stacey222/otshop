import { createHash, randomBytes } from "node:crypto";

import { UserSessionIdSchema, createUuidV7 } from "@otshop/shared";

export const SESSION_TOKEN_BYTES = 32;
export const SESSION_TTL_MS = 8 * 60 * 60 * 1_000;

export interface SessionMaterial {
  readonly id: string;
  readonly rawToken: string;
  readonly tokenHash: Uint8Array;
  readonly expiresAt: Date;
}

export function hashSessionToken(rawToken: string): Uint8Array {
  return createHash("sha256").update(rawToken, "utf8").digest();
}

export function isPlausibleSessionToken(rawToken: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/u.test(rawToken);
}

export function createSessionMaterial(now: Date): SessionMaterial {
  const rawToken = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  return {
    id: UserSessionIdSchema.parse(createUuidV7(now.getTime())),
    rawToken,
    tokenHash: hashSessionToken(rawToken),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  };
}
