import { describe, expect, it } from "vitest";

import { jpegThumbnail } from "./media-test-fixtures";
import { validateJpegThumbnail } from "./jpeg-thumbnail";

describe("validateJpegThumbnail", () => {
  it("accepts a bounded JPEG and returns its encoded dimensions", () => {
    const bytes = jpegThumbnail(320, 180);
    expect(validateJpegThumbnail(bytes, 1_024, 640)).toEqual({
      bytes,
      height: 180,
      mimeType: "image/jpeg",
      width: 320,
    });
  });

  it.each([
    ["empty", new Uint8Array(), 1_024, 640, "OUTPUT_INVALID"],
    ["wrong signature", Uint8Array.from([1, 2, 3]), 1_024, 640, "OUTPUT_INVALID"],
    ["missing EOI", jpegThumbnail().subarray(0, -2), 1_024, 640, "OUTPUT_INVALID"],
    ["missing scan", jpegThumbnail().subarray(0, 19), 1_024, 640, "OUTPUT_INVALID"],
    [
      "invalid segment length",
      Uint8Array.from(jpegThumbnail(), (value, index) => (index === 9 ? 0xff : value)),
      1_024,
      640,
      "OUTPUT_INVALID",
    ],
    [
      "invalid frame sampling",
      Uint8Array.from(jpegThumbnail(), (value, index) => (index === 17 ? 0x00 : value)),
      1_024,
      640,
      "OUTPUT_INVALID",
    ],
    [
      "scan component absent from frame",
      Uint8Array.from(jpegThumbnail(), (value, index) => (index === 24 ? 0x02 : value)),
      1_024,
      640,
      "OUTPUT_INVALID",
    ],
    [
      "non-baseline scan parameters",
      Uint8Array.from(jpegThumbnail(), (value, index) => (index === 27 ? 0x00 : value)),
      1_024,
      640,
      "OUTPUT_INVALID",
    ],
    [
      "malformed scan header",
      Uint8Array.from(jpegThumbnail(), (value, index) => (index === 22 ? 0x07 : value)),
      1_024,
      640,
      "OUTPUT_INVALID",
    ],
    [
      "invalid entropy marker",
      Uint8Array.from(jpegThumbnail(), (value, index) => (index === 29 ? 0xff : value)),
      1_024,
      640,
      "OUTPUT_INVALID",
    ],
    ["oversized bytes", jpegThumbnail(), 10, 640, "OUTPUT_LIMIT_EXCEEDED"],
    ["oversized dimensions", jpegThumbnail(641, 10), 1_024, 640, "OUTPUT_INVALID"],
    ["zero dimension", jpegThumbnail(0, 10), 1_024, 640, "OUTPUT_INVALID"],
  ])("rejects %s", (_name, bytes, maximumBytes, maximumDimension, code) => {
    expect(() =>
      validateJpegThumbnail(
        bytes as Uint8Array,
        maximumBytes as number,
        maximumDimension as number,
      ),
    ).toThrow(expect.objectContaining({ code }));
  });
});
