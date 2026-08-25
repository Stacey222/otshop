import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ThumbnailDerivativeError } from "@/application/media/media-derivative-generator";
import { jpegThumbnail, mediaChunks } from "@/application/media/media-test-fixtures";

import { FFmpegThumbnailGenerator, thumbnailTimestampSeconds } from "./ffmpeg-thumbnail-generator";

const nodeProcess = (script: string) =>
  spawn(process.execPath, ["-e", script], {
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

const successfulScript = (bytes: Uint8Array): string =>
  `process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(Buffer.from('${Buffer.from(bytes).toString("base64")}','base64')))`;

describe("FFmpegThumbnailGenerator process boundary", () => {
  it("uses a fixed pipe-only argument structure and a deterministic bounded timestamp", async () => {
    let executable = "";
    let arguments_: readonly string[] = [];
    const generator = new FFmpegThumbnailGenerator(
      "trusted-ffmpeg",
      1_000,
      4_096,
      640,
      4_096,
      (observedExecutable, observedArguments) => {
        executable = observedExecutable;
        arguments_ = observedArguments;
        return nodeProcess(successfulScript(jpegThumbnail()));
      },
    );
    await expect(
      generator.generateThumbnail({
        durationMs: 10_000n,
        source: mediaChunks(Uint8Array.from([1])),
      }),
    ).resolves.toMatchObject({ width: 320, height: 180, mimeType: "image/jpeg" });
    expect(executable).toBe("trusted-ffmpeg");
    expect(arguments_).toContain("pipe:0");
    expect(arguments_).toContain("pipe:1");
    expect(arguments_).toContain("1.000");
    expect(arguments_.join(" ")).not.toContain("private-name.mp4");
    expect(thumbnailTimestampSeconds(200_000n)).toBe("10.000");
  });

  it.each([
    [
      "non-zero exit",
      "process.stdin.resume();process.stdin.on('end',()=>process.exit(7))",
      "PROCESS_FAILED",
    ],
    ["wrong output", successfulScript(Uint8Array.from([1, 2, 3])), "OUTPUT_INVALID"],
    [
      "empty output",
      "process.stdin.resume();process.stdin.on('end',()=>process.exit(0))",
      "OUTPUT_INVALID",
    ],
  ])("maps %s safely", async (_name, script, code) => {
    const generator = new FFmpegThumbnailGenerator("ffmpeg", 1_000, 4_096, 640, 4_096, () =>
      nodeProcess(script),
    );
    await expect(
      generator.generateThumbnail({
        durationMs: 1_000n,
        source: mediaChunks(Uint8Array.from([1])),
      }),
    ).rejects.toMatchObject({ code, name: "ThumbnailDerivativeError" });
  });

  it("maps synchronous and asynchronous spawn failures without a shell fallback", async () => {
    const synchronous = new FFmpegThumbnailGenerator("missing", 1_000, 4_096, 640, 4_096, () => {
      throw new Error("spawn failure");
    });
    await expect(
      synchronous.generateThumbnail({
        durationMs: 1_000n,
        source: mediaChunks(Uint8Array.from([1])),
      }),
    ).rejects.toMatchObject({ code: "SYSTEM_FAILURE" });

    const asynchronous = new FFmpegThumbnailGenerator(
      join(process.cwd(), "definitely-missing", crypto.randomUUID()),
      1_000,
      4_096,
      640,
      4_096,
    );
    await expect(
      asynchronous.generateThumbnail({
        durationMs: 1_000n,
        source: mediaChunks(Uint8Array.from([1])),
      }),
    ).rejects.toBeInstanceOf(ThumbnailDerivativeError);
  });

  it.each(["stdout", "stderr"] as const)("terminates and awaits %s overflow", async (channel) => {
    let child: ChildProcessWithoutNullStreams | undefined;
    const generator = new FFmpegThumbnailGenerator("ffmpeg", 1_000, 64, 640, 64, () => {
      child = nodeProcess(`process.${channel}.write('x'.repeat(10000));setInterval(()=>{},1000)`);
      return child;
    });
    await expect(
      generator.generateThumbnail({
        durationMs: 1_000n,
        source: mediaChunks(Uint8Array.from([1])),
      }),
    ).rejects.toMatchObject({
      code: channel === "stdout" ? "OUTPUT_LIMIT_EXCEEDED" : "SYSTEM_FAILURE",
    });
    expect(child?.exitCode ?? child?.signalCode).not.toBeNull();
  });

  it("terminates and awaits a timeout", async () => {
    let child: ChildProcessWithoutNullStreams | undefined;
    const generator = new FFmpegThumbnailGenerator("ffmpeg", 30, 4_096, 640, 4_096, () => {
      child = nodeProcess("process.stdin.resume();setInterval(()=>{},1000)");
      return child;
    });
    await expect(
      generator.generateThumbnail({
        durationMs: 1_000n,
        source: mediaChunks(Uint8Array.from([1])),
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(child?.exitCode ?? child?.signalCode).not.toBeNull();
  });

  it("terminates when trusted storage input fails", async () => {
    const brokenSource = async function* () {
      yield Uint8Array.from([1]);
      throw new Error("private storage path");
    };
    const generator = new FFmpegThumbnailGenerator("ffmpeg", 1_000, 4_096, 640, 4_096, () =>
      nodeProcess("process.stdin.resume();setInterval(()=>{},1000)"),
    );
    await expect(
      generator.generateThumbnail({ durationMs: 1_000n, source: brokenSource() }),
    ).rejects.toMatchObject({ code: "INPUT_READ_FAILED" });
  });

  it("maps unexpected process termination without returning partial bytes", async () => {
    const generator = new FFmpegThumbnailGenerator("ffmpeg", 1_000, 4_096, 640, 4_096, () =>
      nodeProcess("process.stdin.resume();process.stdin.on('end',()=>process.abort())"),
    );
    await expect(
      generator.generateThumbnail({
        durationMs: 1_000n,
        source: mediaChunks(Uint8Array.from([1])),
      }),
    ).rejects.toMatchObject({ code: "PROCESS_FAILED" });
  });

  it("rejects invalid server metadata before spawning", async () => {
    let spawned = false;
    const generator = new FFmpegThumbnailGenerator("ffmpeg", 1_000, 4_096, 640, 4_096, () => {
      spawned = true;
      return nodeProcess(successfulScript(jpegThumbnail()));
    });
    await expect(
      generator.generateThumbnail({ durationMs: 0n, source: mediaChunks(Uint8Array.from([1])) }),
    ).rejects.toMatchObject({ code: "OUTPUT_INVALID" });
    expect(spawned).toBe(false);
  });
});
