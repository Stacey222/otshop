import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PermanentMediaInspectionError } from "@/application/media/media-inspector";
import { mediaChunks } from "@/application/media/media-test-fixtures";

import { FFprobeMediaInspector } from "./ffprobe-media-inspector";

const execute = promisify(execFile);
const testParent = resolve("storage", "ffprobe-test-runs");
const testRoot = join(testParent, crypto.randomUUID());
const fixturePath = join(testRoot, "valid.mp4");

const clean = async (): Promise<void> => {
  const relation = relative(testParent, testRoot);
  if (relation.length === 0 || relation.startsWith("..")) {
    throw new Error("Unsafe FFprobe fixture cleanup target");
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
      "color=c=black:s=16x16:r=25",
      "-t",
      "0.2",
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

describe("real FFprobe integration", () => {
  it("inspects an actual deterministic H.264 MP4 fixture", async () => {
    const inspector = new FFprobeMediaInspector("ffprobe", 15_000, 262_144);
    await expect(inspector.inspect(createReadStream(fixturePath))).resolves.toMatchObject({
      durationMs: 200n,
      width: 16,
      height: 16,
      fps: 25,
      codec: "h264",
      audioCodec: null,
      orientation: "ROTATION_0",
    });
  });

  it("rejects malformed bytes without exposing raw FFprobe diagnostics", async () => {
    const inspector = new FFprobeMediaInspector("ffprobe", 15_000, 262_144);
    await expect(
      inspector.inspect(mediaChunks(new TextEncoder().encode("not media"))),
    ).rejects.toBeInstanceOf(PermanentMediaInspectionError);
  });
});
