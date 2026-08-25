import { createHash } from "node:crypto";

import {
  AuthenticatedContextSchema,
  ROLE_PERMISSIONS,
  RequestIdSchema,
  WorkspaceIdSchema,
  type AuthenticatedContext,
  type Role,
} from "@otshop/shared";

import type { ApplicationLogger } from "@/infrastructure/logging/logger";

export const mediaWorkspaceA = WorkspaceIdSchema.parse("018f1000-0000-7000-8000-000000000001");
export const mediaWorkspaceB = WorkspaceIdSchema.parse("018f1000-0000-7000-8000-000000000002");
export const mediaRequestId = RequestIdSchema.parse("018f1000-0000-7000-8000-000000000003");

export const validMp4 = Uint8Array.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00,
  0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
]);

export const validMp4Sha256 = createHash("sha256").update(validMp4).digest("hex");

export const jpegThumbnail = (width = 320, height = 180): Uint8Array =>
  Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x02,
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xda,
    0x00,
    0x08,
    0x01,
    0x01,
    0x00,
    0x00,
    0x3f,
    0x00,
    0x00,
    0xff,
    0xd9,
  ]);

export async function* mediaChunks(
  bytes: Uint8Array,
  chunkSize = bytes.byteLength,
): AsyncIterable<Uint8Array> {
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    yield bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength));
  }
}

export function mediaContext(
  role: Role = "ADMIN",
  workspaceId = mediaWorkspaceA,
): AuthenticatedContext {
  return AuthenticatedContextSchema.parse({
    userId: "018f1000-0000-7000-8000-000000000004",
    sessionId: "018f1000-0000-7000-8000-000000000005",
    workspaceId,
    role,
    permissions: ROLE_PERMISSIONS[role],
  });
}

export const silentMediaLogger: ApplicationLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  withContext: () => silentMediaLogger,
};
