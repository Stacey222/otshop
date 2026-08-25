import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mediaChunks } from "@/application/media/media-test-fixtures";

import { FFmpegThumbnailGenerator } from "./ffmpeg-thumbnail-generator";

const execute = promisify(execFile);
const testParent = resolve("storage", "ffmpeg-thumbnail-test-runs");
const testRoot = join(testParent, crypto.randomUUID());
const fixturePath = join(testRoot, "valid.mp4");

const clean = async (): Promise<void> => {
  const relation = relative(testParent, testRoot);
  if (relation.length === 0 || relation.startsWith("..")) {
    throw new Error("Unsafe FFmpeg fixture cleanup target");
  }
  await rm(testRoot, { recursive: true, force: true });
};

beforeAll(async () => {
  await mkdir(testRoot, { recursive: true });
  await execute(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=16x16:r=25",
      "-t",
      "0.4",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-movflags",
      "+faststart",
      "-y",
      fixturePath,
    ],
    { timeout: 20_000, windowsHide: true, maxBuffer: 256 * 1_024 },
  );
});

afterAll(clean);

describe("real FFmpeg thumbnail integration", () => {
  it("creates one bounded JPEG from a streamed immutable H.264 MP4 without upscaling", async () => {
    const generator = new FFmpegThumbnailGenerator("ffmpeg", 15_000, 1_048_576, 640, 262_144);
    await expect(
      generator.generateThumbnail({ durationMs: 400n, source: createReadStream(fixturePath) }),
    ).resolves.toMatchObject({
      height: 16,
      mimeType: "image/jpeg",
      width: 16,
    });
  });

  it("rejects malformed original bytes without exposing FFmpeg diagnostics", async () => {
    const generator = new FFmpegThumbnailGenerator("ffmpeg", 15_000, 1_048_576, 640, 262_144);
    await expect(
      generator.generateThumbnail({
        durationMs: 1_000n,
        source: mediaChunks(new TextEncoder().encode("not media")),
      }),
    ).rejects.toMatchObject({ code: "PROCESS_FAILED", name: "ThumbnailDerivativeError" });
  });
});
