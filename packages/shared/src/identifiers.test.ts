import { describe, expect, it } from "vitest";

import {
  DatasetIdSchema,
  DeviceIdSchema,
  MediaAssetIdSchema,
  OrganizationIdSchema,
  ProductReferenceIdSchema,
  ProjectIdSchema,
  PublishAttemptIdSchema,
  PublishJobIdSchema,
  RequestIdSchema,
  ScheduleIdSchema,
  ShopeeAccountIdSchema,
  UserIdSchema,
  WorkerIdSchema,
  WorkspaceIdSchema,
  createUuidV7,
} from "./identifiers";

const validUuidV7 = "01941f29-7c00-7000-8000-000000000001";

describe("identifier contracts", () => {
  const schemas = [
    UserIdSchema,
    OrganizationIdSchema,
    WorkspaceIdSchema,
    WorkerIdSchema,
    DeviceIdSchema,
    ShopeeAccountIdSchema,
    DatasetIdSchema,
    MediaAssetIdSchema,
    ProjectIdSchema,
    PublishJobIdSchema,
    PublishAttemptIdSchema,
    ScheduleIdSchema,
    ProductReferenceIdSchema,
    RequestIdSchema,
  ];

  it("generates canonical lowercase UUIDv7 identifiers", () => {
    const generated = createUuidV7(1_725_000_000_000);
    expect(generated).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(RequestIdSchema.parse(generated)).toBe(generated);
  });

  it("accepts canonical UUIDv7 strings for every identifier", () => {
    for (const schema of schemas) {
      expect(schema.parse(validUuidV7)).toBe(validUuidV7);
    }
  });

  it.each(["not-a-uuid", "550e8400-e29b-41d4-a716-446655440000", validUuidV7.toUpperCase()])(
    "rejects an invalid identifier value: %s",
    (value) => {
      for (const schema of schemas) {
        expect(schema.safeParse(value).success).toBe(false);
      }
    },
  );
});
