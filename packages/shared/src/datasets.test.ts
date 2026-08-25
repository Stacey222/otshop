import { describe, expect, it } from "vitest";

import {
  DatasetCreateRequestSchema,
  DatasetItemAddRequestSchema,
  DatasetReorderRequestSchema,
  DatasetUpdateRequestSchema,
} from "./datasets";

const mediaAssetId = "01941f29-7c00-7000-8000-000000000001";
const itemId = "01941f29-7c00-7000-8000-000000000002";

describe("dataset contracts", () => {
  it("normalizes bounded dataset text", () => {
    expect(
      DatasetCreateRequestSchema.parse({ name: "  Dataset  ", description: "  Notes  " }),
    ).toEqual({ name: "Dataset", description: "Notes" });
    expect(DatasetCreateRequestSchema.parse({ name: "Dataset", description: "  " })).toEqual({
      name: "Dataset",
      description: null,
    });
  });

  it("rejects empty updates, unknown fields, controls, and excessive text", () => {
    expect(() => DatasetUpdateRequestSchema.parse({ expectedVersion: 1 })).toThrow();
    expect(() => DatasetCreateRequestSchema.parse({ name: "bad\u0000name" })).toThrow();
    expect(() => DatasetCreateRequestSchema.parse({ name: "x".repeat(121) })).toThrow();
    expect(() =>
      DatasetCreateRequestSchema.parse({ name: "Dataset", workspaceId: itemId }),
    ).toThrow();
  });

  it("accepts only bounded dataset-owned item fields", () => {
    expect(
      DatasetItemAddRequestSchema.parse({
        expectedVersion: 1,
        mediaAssetId,
        captionOverride: " Caption ",
      }),
    ).toMatchObject({ captionOverride: "Caption" });
    expect(() =>
      DatasetItemAddRequestSchema.parse({ expectedVersion: 1, mediaAssetId, customFields: {} }),
    ).toThrow();
  });

  it("bounds full-order replacement", () => {
    expect(DatasetReorderRequestSchema.parse({ expectedVersion: 1, itemIds: [itemId] })).toEqual({
      expectedVersion: 1,
      itemIds: [itemId],
    });
    expect(() =>
      DatasetReorderRequestSchema.parse({ expectedVersion: 0, itemIds: [itemId] }),
    ).toThrow();
    expect(() =>
      DatasetReorderRequestSchema.parse({
        expectedVersion: 1,
        itemIds: Array.from({ length: 1_000 }, () => itemId),
      }),
    ).not.toThrow();
    expect(() =>
      DatasetReorderRequestSchema.parse({
        expectedVersion: 1,
        itemIds: Array.from({ length: 1_001 }, () => itemId),
      }),
    ).toThrow();
  });
});
