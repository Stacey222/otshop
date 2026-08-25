import { describe, expect, it } from "vitest";

import {
  MEDIA_BATCH_MAX_FILES,
  MediaImportBatchCreateRequestSchema,
  MediaImportBatchInputIndexSchema,
  MediaImportBatchVersionRequestSchema,
} from "./media-batches";

describe("media batch contracts", () => {
  it("normalizes a bounded display name without accepting paths or ownership", () => {
    expect(MediaImportBatchCreateRequestSchema.parse({ name: "  Folder A  " })).toEqual({
      name: "Folder A",
    });
    expect(() =>
      MediaImportBatchCreateRequestSchema.parse({
        name: "Folder A",
        workspaceId: "01941f29-7c00-7000-8000-000000000001",
      }),
    ).toThrow();
  });

  it("enforces exact input-index and version boundaries", () => {
    expect(MediaImportBatchInputIndexSchema.parse(0)).toBe(0);
    expect(MediaImportBatchInputIndexSchema.parse(MEDIA_BATCH_MAX_FILES - 1)).toBe(24);
    expect(() => MediaImportBatchInputIndexSchema.parse(MEDIA_BATCH_MAX_FILES)).toThrow();
    expect(MediaImportBatchVersionRequestSchema.parse({ expectedVersion: 1 })).toEqual({
      expectedVersion: 1,
    });
    expect(() => MediaImportBatchVersionRequestSchema.parse({ expectedVersion: 0 })).toThrow();
  });
});
