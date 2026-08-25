import { describe, expect, it } from "vitest";

import { normalizeFFprobeOutput } from "./ffprobe-output";
import { PermanentMediaInspectionError } from "./media-inspector";

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

const video = (overrides: Record<string, unknown> = {}) => ({
  index: 0,
  codec_type: "video",
  codec_name: "h264",
  pix_fmt: "yuv420p",
  width: 1920,
  height: 1080,
  avg_frame_rate: "30000/1001",
  bit_rate: "4000000",
  disposition: { default: 1 },
  ...overrides,
});

const probe = (
  streams: unknown[] = [video(), { index: 1, codec_type: "audio", codec_name: "aac" }],
  format: Record<string, unknown> = {
    format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    duration: "12.345",
    bit_rate: "4200000",
  },
) => encode({ streams, format });

const rejectionCode = (input: Uint8Array): string | undefined => {
  try {
    normalizeFFprobeOutput(input);
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(PermanentMediaInspectionError);
    return (error as PermanentMediaInspectionError).code;
  }
};

describe("normalizeFFprobeOutput", () => {
  it("normalizes bounded video and audio metadata deterministically", () => {
    expect(normalizeFFprobeOutput(probe())).toEqual({
      durationMs: 12_345n,
      width: 1920,
      height: 1080,
      fps: 29.97,
      bitrateBps: 4_000_000n,
      codec: "h264",
      audioCodec: "aac",
      orientation: "ROTATION_0",
    });
  });

  it("supports video-only media and normalizes side-data rotation", () => {
    expect(
      normalizeFFprobeOutput(
        probe([
          video({
            side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }],
          }),
        ]),
      ),
    ).toMatchObject({ audioCodec: null, orientation: "ROTATION_270" });
  });

  it("selects the default stream before index and ignores subtitle/data streams", () => {
    const result = normalizeFFprobeOutput(
      probe([
        video({ index: 0, codec_name: "vp9", disposition: { default: 0 } }),
        { index: 1, codec_type: "subtitle", codec_name: "mov_text" },
        video({ index: 4, width: 720, height: 1280, disposition: { default: 1 } }),
      ]),
    );
    expect(result).toMatchObject({ width: 720, height: 1280 });
  });

  it.each([
    ["invalid JSON", new TextEncoder().encode("{"), "PROBE_OUTPUT_INVALID"],
    ["missing fields", encode({ streams: [] }), "PROBE_OUTPUT_INVALID"],
    [
      "missing video",
      probe([{ index: 0, codec_type: "audio", codec_name: "aac" }]),
      "NO_VIDEO_STREAM",
    ],
    [
      "unsupported container",
      probe([video()], { format_name: "matroska", duration: "1" }),
      "CONTAINER_UNSUPPORTED",
    ],
    [
      "negative duration",
      probe([video()], { format_name: "mp4", duration: "-1" }),
      "DURATION_INVALID",
    ],
    ["NaN duration", probe([video()], { format_name: "mp4", duration: "NaN" }), "DURATION_INVALID"],
    ["zero duration", probe([video()], { format_name: "mp4", duration: "0" }), "DURATION_INVALID"],
    ["invalid width", probe([video({ width: 0 })]), "DIMENSIONS_INVALID"],
    ["giant height", probe([video({ height: 2147483647 })]), "DIMENSIONS_INVALID"],
    ["division by zero", probe([video({ avg_frame_rate: "30/0" })]), "FRAME_RATE_INVALID"],
    ["absurd frame rate", probe([video({ avg_frame_rate: "1000/1" })]), "FRAME_RATE_INVALID"],
    ["unsupported video codec", probe([video({ codec_name: "hevc" })]), "UNSUPPORTED_VIDEO_CODEC"],
    [
      "unsupported pixel format",
      probe([video({ pix_fmt: "yuv444p" })]),
      "UNSUPPORTED_PIXEL_FORMAT",
    ],
    [
      "unsupported audio codec",
      probe([video(), { index: 1, codec_type: "audio", codec_name: "opus" }]),
      "UNSUPPORTED_AUDIO_CODEC",
    ],
    ["invalid rotation", probe([video({ tags: { rotate: "45" } })]), "PROBE_OUTPUT_INVALID"],
    ["giant bitrate", probe([video({ bit_rate: "1000000000001" })]), "PROBE_OUTPUT_INVALID"],
  ])("rejects %s", (_name, input, code) => {
    expect(rejectionCode(input as Uint8Array)).toBe(code);
  });
});
