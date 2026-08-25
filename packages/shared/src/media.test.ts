import { describe, expect, it } from "vitest";

import {
  MediaInspectionFailureCodeSchema,
  MediaInspectionStatusSchema,
  MediaOrientationSchema,
} from "./media";

describe("media inspection contracts", () => {
  it("accepts only canonical lifecycle, orientation, and failure values", () => {
    expect(MediaInspectionStatusSchema.parse("READY")).toBe("READY");
    expect(MediaOrientationSchema.parse("ROTATION_270")).toBe("ROTATION_270");
    expect(MediaInspectionFailureCodeSchema.parse("TIMEOUT")).toBe("TIMEOUT");
    expect(MediaInspectionStatusSchema.safeParse("PUBLISHABLE").success).toBe(false);
    expect(MediaOrientationSchema.safeParse("PORTRAIT").success).toBe(false);
    expect(MediaInspectionFailureCodeSchema.safeParse("RAW_STDERR").success).toBe(false);
  });
});
