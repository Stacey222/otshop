import { z } from "zod";

function identifierSchema<T extends string>(description: T) {
  return z
    .uuidv7()
    .regex(/^[0-9a-f-]+$/)
    .brand<T>()
    .describe(description);
}

const hex = (value: number): string => value.toString(16).padStart(2, "0");

export function createUuidV7(now: number = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffffffffffff) {
    throw new RangeError("UUIDv7 timestamp must be a non-negative 48-bit integer");
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let timestamp = now;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp % 256;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const encoded = [...bytes].map(hex).join("");
  return `${encoded.slice(0, 8)}-${encoded.slice(8, 12)}-${encoded.slice(12, 16)}-${encoded.slice(16, 20)}-${encoded.slice(20)}`;
}

export const UserIdSchema = identifierSchema("UserId");
export type UserId = z.infer<typeof UserIdSchema>;

export const OrganizationIdSchema = identifierSchema("OrganizationId");
export type OrganizationId = z.infer<typeof OrganizationIdSchema>;

export const WorkspaceIdSchema = identifierSchema("WorkspaceId");
export type WorkspaceId = z.infer<typeof WorkspaceIdSchema>;

export const WorkerIdSchema = identifierSchema("WorkerId");
export type WorkerId = z.infer<typeof WorkerIdSchema>;

export const DeviceIdSchema = identifierSchema("DeviceId");
export type DeviceId = z.infer<typeof DeviceIdSchema>;

export const ShopeeAccountIdSchema = identifierSchema("ShopeeAccountId");
export type ShopeeAccountId = z.infer<typeof ShopeeAccountIdSchema>;

export const DatasetIdSchema = identifierSchema("DatasetId");
export type DatasetId = z.infer<typeof DatasetIdSchema>;

export const DatasetItemIdSchema = identifierSchema("DatasetItemId");
export type DatasetItemId = z.infer<typeof DatasetItemIdSchema>;

export const MediaAssetIdSchema = identifierSchema("MediaAssetId");
export type MediaAssetId = z.infer<typeof MediaAssetIdSchema>;

export const ProjectIdSchema = identifierSchema("ProjectId");
export type ProjectId = z.infer<typeof ProjectIdSchema>;

export const PublishJobIdSchema = identifierSchema("PublishJobId");
export type PublishJobId = z.infer<typeof PublishJobIdSchema>;

export const PublishAttemptIdSchema = identifierSchema("PublishAttemptId");
export type PublishAttemptId = z.infer<typeof PublishAttemptIdSchema>;

export const ScheduleIdSchema = identifierSchema("ScheduleId");
export type ScheduleId = z.infer<typeof ScheduleIdSchema>;

export const ProductReferenceIdSchema = identifierSchema("ProductReferenceId");
export type ProductReferenceId = z.infer<typeof ProductReferenceIdSchema>;

export const RequestIdSchema = identifierSchema("RequestId");
export type RequestId = z.infer<typeof RequestIdSchema>;

export const UserSessionIdSchema = identifierSchema("UserSessionId");
export type UserSessionId = z.infer<typeof UserSessionIdSchema>;
