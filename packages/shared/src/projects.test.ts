import { describe, expect, it } from "vitest";

import {
  PROJECT_DAILY_TARGET_MAX,
  ProjectCreateRequestSchema,
  ProjectItemMaterializeRequestSchema,
  ProjectItemProductAssignRequestSchema,
  ProjectItemProductBulkAssignRequestSchema,
  ProjectItemStatusSchema,
  ProjectPostingWindowSchema,
  ProjectUpdateRequestSchema,
} from "./projects";

const datasetId = "01941f29-7c00-7000-8000-000000000001";
const productId = "01941f29-7c00-7000-8000-000000000002";

describe("project configuration contracts", () => {
  it("normalizes bounded project input and rejects ownership fields", () => {
    expect(
      ProjectCreateRequestSchema.parse({ name: "  Morning catalog  ", datasetId }),
    ).toMatchObject({ name: "Morning catalog", datasetId });
    expect(() =>
      ProjectCreateRequestSchema.parse({ name: "Catalog", datasetId, workspaceId: datasetId }),
    ).toThrow();
  });

  it("rejects missing, malformed, empty, and overlong create fields", () => {
    for (const body of [
      { name: "Catalog" },
      { name: "Catalog", datasetId: "not-a-dataset" },
      { name: "   ", datasetId },
      { name: "x".repeat(121), datasetId },
    ]) {
      expect(() => ProjectCreateRequestSchema.parse(body)).toThrow();
    }
  });

  it("enforces daily-target boundaries", () => {
    expect(
      ProjectCreateRequestSchema.parse({ name: "Catalog", datasetId, dailyTarget: 1 }).dailyTarget,
    ).toBe(1);
    expect(
      ProjectCreateRequestSchema.parse({
        name: "Catalog",
        datasetId,
        dailyTarget: PROJECT_DAILY_TARGET_MAX,
      }).dailyTarget,
    ).toBe(50);
    expect(() =>
      ProjectCreateRequestSchema.parse({ name: "Catalog", datasetId, dailyTarget: 0 }),
    ).toThrow();
    expect(() =>
      ProjectCreateRequestSchema.parse({ name: "Catalog", datasetId, dailyTarget: 51 }),
    ).toThrow();
  });

  it("accepts canonical IANA windows and rejects invalid or overnight windows", () => {
    expect(
      ProjectPostingWindowSchema.parse({
        startLocalTime: "09:00",
        endLocalTime: "21:00",
        timezone: "Asia/Jakarta",
      }),
    ).toBeDefined();
    for (const postingWindow of [
      { startLocalTime: "21:00", endLocalTime: "09:00", timezone: "Asia/Jakarta" },
      { startLocalTime: "09:00", endLocalTime: "21:00", timezone: "GMT+7" },
      { startLocalTime: "9:00", endLocalTime: "21:00", timezone: "Asia/Jakarta" },
    ]) {
      expect(() => ProjectPostingWindowSchema.parse(postingWindow)).toThrow();
    }
  });

  it("requires a bounded update field and rejects unknown fields", () => {
    expect(() => ProjectUpdateRequestSchema.parse({ expectedVersion: 1 })).toThrow();
    expect(() =>
      ProjectUpdateRequestSchema.parse({ expectedVersion: 1, dailyTarget: 5, cron: "* * * * *" }),
    ).toThrow();
    expect(ProjectUpdateRequestSchema.parse({ expectedVersion: 1, postingWindow: null })).toEqual({
      expectedVersion: 1,
      postingWindow: null,
    });
  });

  it("bounds ProjectItem lifecycle and materialization input", () => {
    expect(ProjectItemStatusSchema.options).toEqual(["ACTIVE", "ARCHIVED"]);
    expect(ProjectItemMaterializeRequestSchema.parse({ expectedVersion: 1 })).toEqual({
      expectedVersion: 1,
    });
    expect(() =>
      ProjectItemMaterializeRequestSchema.parse({ expectedVersion: 1, workspaceId: datasetId }),
    ).toThrow();
  });

  it("strictly validates single and bounded-all product assignment commands", () => {
    const command = { productId, expectedVersion: 2 };
    expect(ProjectItemProductAssignRequestSchema.parse(command)).toEqual(command);
    expect(ProjectItemProductBulkAssignRequestSchema.parse(command)).toEqual(command);
    expect(() =>
      ProjectItemProductAssignRequestSchema.parse({
        ...command,
        productUrl: "https://example.test",
      }),
    ).toThrow();
    expect(() =>
      ProjectItemProductAssignRequestSchema.parse({ productId: "invalid", expectedVersion: 2 }),
    ).toThrow();
  });
});
