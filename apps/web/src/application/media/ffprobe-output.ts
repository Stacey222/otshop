import { z } from "zod";

import {
  PermanentMediaInspectionError,
  type MediaInspectionFailureCode,
  type NormalizedMediaMetadata,
} from "./media-inspector";

const MAX_DURATION_SECONDS = 86_400;
const MAX_DIMENSION = 16_384;
const MAX_FRAME_RATE = 240;
const MAX_BITRATE_BPS = 1_000_000_000_000n;

const dispositionSchema = z
  .object({ default: z.union([z.number(), z.string()]).optional() })
  .loose();
const sideDataSchema = z.object({ rotation: z.union([z.number(), z.string()]).optional() }).loose();
const streamSchema = z
  .object({
    index: z.number().int().nonnegative(),
    codec_type: z.string().optional(),
    codec_name: z.string().optional(),
    pix_fmt: z.string().optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    avg_frame_rate: z.string().optional(),
    r_frame_rate: z.string().optional(),
    bit_rate: z.string().optional(),
    duration: z.string().optional(),
    disposition: dispositionSchema.optional(),
    tags: z.object({ rotate: z.string().optional() }).loose().optional(),
    side_data_list: z.array(sideDataSchema).optional(),
  })
  .loose();

const outputSchema = z
  .object({
    streams: z.array(streamSchema),
    format: z
      .object({
        format_name: z.string(),
        duration: z.string().optional(),
        bit_rate: z.string().optional(),
      })
      .loose(),
  })
  .loose();

type ProbeStream = z.infer<typeof streamSchema>;

const reject = (code: MediaInspectionFailureCode): never => {
  throw new PermanentMediaInspectionError(code);
};

const defaultDisposition = (stream: ProbeStream): boolean =>
  Number(stream.disposition?.default ?? 0) === 1;

const selectPrimary = (streams: readonly ProbeStream[], type: "video" | "audio") =>
  [...streams]
    .filter((stream) => stream.codec_type === type)
    .sort(
      (left, right) =>
        Number(defaultDisposition(right)) - Number(defaultDisposition(left)) ||
        left.index - right.index,
    )[0];

const parsePositiveDecimal = (value: string | undefined, code: MediaInspectionFailureCode) => {
  if (value === undefined || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) reject(code);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) reject(code);
  return parsed;
};

const parseFrameRate = (value: string | undefined): number => {
  if (value === undefined) return reject("FRAME_RATE_INVALID");
  const match = /^(\d+)\/(\d+)$/u.exec(value);
  if (match === null) return reject("FRAME_RATE_INVALID");
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    return reject("FRAME_RATE_INVALID");
  }
  const fps = numerator / denominator;
  if (!Number.isFinite(fps) || fps <= 0 || fps > MAX_FRAME_RATE) {
    return reject("FRAME_RATE_INVALID");
  }
  return Math.round(fps * 1_000) / 1_000;
};

const parseBitrate = (value: string | undefined): bigint | null => {
  if (value === undefined) return null;
  if (!/^\d+$/u.test(value)) return reject("PROBE_OUTPUT_INVALID");
  const bitrate = BigInt(value);
  if (bitrate < 0n || bitrate > MAX_BITRATE_BPS) return reject("PROBE_OUTPUT_INVALID");
  return bitrate;
};

const rotationFor = (stream: ProbeStream): NormalizedMediaMetadata["orientation"] => {
  const raw =
    stream.side_data_list?.find((entry) => entry.rotation !== undefined)?.rotation ??
    stream.tags?.rotate ??
    0;
  const rotation = Number(raw);
  if (!Number.isFinite(rotation) || !Number.isInteger(rotation)) {
    return reject("PROBE_OUTPUT_INVALID");
  }
  const normalized = ((rotation % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(normalized)) return reject("PROBE_OUTPUT_INVALID");
  return `ROTATION_${normalized}` as NormalizedMediaMetadata["orientation"];
};

export function normalizeFFprobeOutput(stdout: Uint8Array): NormalizedMediaMetadata {
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(stdout));
  } catch {
    return reject("PROBE_OUTPUT_INVALID");
  }
  const parsed = outputSchema.safeParse(decoded);
  if (!parsed.success) return reject("PROBE_OUTPUT_INVALID");
  const formatNames = new Set(parsed.data.format.format_name.split(","));
  if (!formatNames.has("mp4") && !formatNames.has("mov")) reject("CONTAINER_UNSUPPORTED");

  const video = selectPrimary(parsed.data.streams, "video");
  if (video === undefined) return reject("NO_VIDEO_STREAM");
  if (video.codec_name !== "h264") return reject("UNSUPPORTED_VIDEO_CODEC");
  if (video.pix_fmt !== "yuv420p" && video.pix_fmt !== "yuvj420p") {
    return reject("UNSUPPORTED_PIXEL_FORMAT");
  }
  if (
    video.width === undefined ||
    video.height === undefined ||
    video.width <= 0 ||
    video.height <= 0 ||
    video.width > MAX_DIMENSION ||
    video.height > MAX_DIMENSION
  ) {
    return reject("DIMENSIONS_INVALID");
  }

  const durationSeconds = parsePositiveDecimal(
    parsed.data.format.duration ?? video.duration,
    "DURATION_INVALID",
  );
  if (durationSeconds > MAX_DURATION_SECONDS) reject("DURATION_INVALID");
  const durationMs = BigInt(Math.round(durationSeconds * 1_000));
  if (durationMs <= 0n) reject("DURATION_INVALID");

  const audio = selectPrimary(parsed.data.streams, "audio");
  if (audio !== undefined && audio.codec_name !== "aac") reject("UNSUPPORTED_AUDIO_CODEC");

  return {
    durationMs,
    width: video.width,
    height: video.height,
    fps: parseFrameRate(video.avg_frame_rate ?? video.r_frame_rate),
    bitrateBps: parseBitrate(video.bit_rate ?? parsed.data.format.bit_rate),
    codec: "h264",
    audioCodec: audio === undefined ? null : "aac",
    orientation: rotationFor(video),
  };
}
