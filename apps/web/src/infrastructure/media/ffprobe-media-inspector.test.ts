import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TransientMediaInspectionError } from "@/application/media/media-inspector";
import { mediaChunks } from "@/application/media/media-test-fixtures";

import { FFprobeMediaInspector } from "./ffprobe-media-inspector";

const validOutput = JSON.stringify({
  streams: [
    {
      index: 0,
      codec_type: "video",
      codec_name: "h264",
      pix_fmt: "yuv420p",
      width: 16,
      height: 16,
      avg_frame_rate: "25/1",
      disposition: { default: 1 },
    },
  ],
  format: { format_name: "mov,mp4", duration: "0.2", bit_rate: "1000" },
});

const nodeProcess = (script: string) =>
  spawn(process.execPath, ["-e", script], {
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

describe("FFprobeMediaInspector process boundary", () => {
  it("uses fixed structured arguments and streams input to a successful process", async () => {
    let observedExecutable = "";
    let observedArguments: readonly string[] = [];
    const inspector = new FFprobeMediaInspector("trusted-ffprobe", 1_000, 16_384, (exe, args) => {
      observedExecutable = exe;
      observedArguments = args;
      return nodeProcess(
        `let n=0;process.stdin.on('data',c=>n+=c.length);process.stdin.on('end',()=>{if(n!==3)process.exit(2);process.stdout.write(${JSON.stringify(validOutput)})})`,
      );
    });
    await expect(
      inspector.inspect(mediaChunks(Uint8Array.from([1, 2, 3]), 1)),
    ).resolves.toMatchObject({
      codec: "h264",
      width: 16,
      height: 16,
    });
    expect(observedExecutable).toBe("trusted-ffprobe");
    expect(observedArguments).toContain("pipe:0");
    expect(observedArguments.join(" ")).not.toMatch(/[;&|]C:\\/u);
  });

  it("maps non-zero exit without leaking stderr", async () => {
    const inspector = new FFprobeMediaInspector("ffprobe", 1_000, 4_096, () =>
      nodeProcess("process.stderr.write('sensitive path');process.exit(7)"),
    );
    await expect(inspector.inspect(mediaChunks(Uint8Array.from([1])))).rejects.toMatchObject({
      code: "PROBE_INVALID_MEDIA",
      name: "PermanentMediaInspectionError",
    });
  });

  it.each(["stdout", "stderr"] as const)("terminates on %s overflow", async (channel) => {
    const script = `process.${channel}.write('x'.repeat(10000));setInterval(()=>{},1000)`;
    const inspector = new FFprobeMediaInspector("ffprobe", 1_000, 4_096, () => nodeProcess(script));
    await expect(inspector.inspect(mediaChunks(Uint8Array.from([1])))).rejects.toMatchObject({
      code: "OUTPUT_LIMIT_EXCEEDED",
      name: "PermanentMediaInspectionError",
    });
  });

  it("terminates and awaits a timed-out child", async () => {
    let child: ChildProcessWithoutNullStreams | undefined;
    const inspector = new FFprobeMediaInspector("ffprobe", 30, 4_096, () => {
      child = nodeProcess("process.stdin.resume();setInterval(()=>{},1000)");
      return child;
    });
    await expect(inspector.inspect(mediaChunks(Uint8Array.from([1])))).rejects.toMatchObject({
      code: "TIMEOUT",
      name: "TransientMediaInspectionError",
    });
    expect(child?.exitCode ?? child?.signalCode).not.toBeNull();
  });

  it("maps synchronous spawn and storage-stream failures safely", async () => {
    const spawnFailure = new FFprobeMediaInspector("missing", 100, 4_096, () => {
      throw new Error("spawn failure");
    });
    await expect(spawnFailure.inspect(mediaChunks(Uint8Array.from([1])))).rejects.toBeInstanceOf(
      TransientMediaInspectionError,
    );

    const brokenSource = async function* () {
      yield Uint8Array.from([1]);
      throw new Error("storage path must not leak");
    };
    const readFailure = new FFprobeMediaInspector("ffprobe", 1_000, 4_096, () =>
      nodeProcess("process.stdin.resume();setInterval(()=>{},1000)"),
    );
    await expect(readFailure.inspect(brokenSource())).rejects.toMatchObject({
      code: "STORAGE_READ_FAILED",
      name: "TransientMediaInspectionError",
    });
  });

  it("maps an asynchronous executable startup failure without shell fallback", async () => {
    const inspector = new FFprobeMediaInspector(
      join(process.cwd(), "definitely-missing", crypto.randomUUID()),
      1_000,
      4_096,
    );
    await expect(inspector.inspect(mediaChunks(Uint8Array.from([1])))).rejects.toMatchObject({
      code: "SYSTEM_FAILURE",
      message: "The media inspector is temporarily unavailable",
      name: "TransientMediaInspectionError",
    });
  });
});
