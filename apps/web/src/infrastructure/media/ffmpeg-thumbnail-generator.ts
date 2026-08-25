import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { validateJpegThumbnail } from "@/application/media/jpeg-thumbnail";
import {
  ThumbnailDerivativeError,
  type MediaDerivativeGenerator,
  type ThumbnailDerivative,
} from "@/application/media/media-derivative-generator";

type SpawnProcess = (
  executable: string,
  arguments_: readonly string[],
) => ChildProcessWithoutNullStreams;

const ffmpegEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const key of [
    "LANG",
    "LC_ALL",
    "LD_LIBRARY_PATH",
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "TZ",
    "WINDIR",
  ]) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  return environment;
};

const defaultSpawn: SpawnProcess = (executable, arguments_) =>
  spawn(executable, arguments_, {
    cwd: process.cwd(),
    env: ffmpegEnvironment(),
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

type ForcedOutcome = "DIAGNOSTIC" | "INPUT" | "OUTPUT" | "SPAWN" | "TIMEOUT";

const isBrokenPipe = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  ["EPIPE", "ERR_STREAM_PREMATURE_CLOSE"].includes(String(Reflect.get(error, "code")));

export const thumbnailTimestampSeconds = (durationMs: bigint): string => {
  const durationSeconds = Number(durationMs) / 1_000;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new ThumbnailDerivativeError("OUTPUT_INVALID");
  }
  return Math.min(durationSeconds * 0.1, 10).toFixed(3);
};

const argumentsFor = (durationMs: bigint, maximumDimension: number): readonly string[] => [
  "-hide_banner",
  "-loglevel",
  "error",
  "-nostdin",
  "-i",
  "pipe:0",
  "-ss",
  thumbnailTimestampSeconds(durationMs),
  "-map",
  "0:v:0",
  "-an",
  "-sn",
  "-dn",
  "-vf",
  `scale=w='min(${maximumDimension},iw)':h='min(${maximumDimension},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
  "-frames:v",
  "1",
  "-threads",
  "1",
  "-c:v",
  "mjpeg",
  "-q:v",
  "3",
  "-f",
  "image2pipe",
  "pipe:1",
];

export class FFmpegThumbnailGenerator implements MediaDerivativeGenerator {
  constructor(
    private readonly executable: string,
    private readonly timeoutMs: number,
    private readonly maximumBytes: number,
    private readonly maximumDimension: number,
    private readonly maximumDiagnosticBytes: number,
    private readonly spawnProcess: SpawnProcess = defaultSpawn,
  ) {}

  async generateThumbnail(input: {
    readonly durationMs: bigint;
    readonly source: AsyncIterable<Uint8Array>;
  }): Promise<ThumbnailDerivative> {
    const arguments_ = argumentsFor(input.durationMs, this.maximumDimension);
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.spawnProcess(this.executable, arguments_);
    } catch {
      throw new ThumbnailDerivativeError("SYSTEM_FAILURE");
    }

    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let forced: ForcedOutcome | undefined;
    let settled = false;
    const terminate = (outcome: ForcedOutcome): void => {
      if (forced === undefined) forced = outcome;
      if (!child.killed) child.kill("SIGKILL");
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > this.maximumBytes) {
        terminate("OUTPUT");
        return;
      }
      stdout.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > this.maximumDiagnosticBytes) terminate("DIAGNOSTIC");
    });

    const sourceStream = Readable.from(input.source);
    const inputDone = pipeline(sourceStream, child.stdin).catch((error: unknown) => {
      if (!isBrokenPipe(error) && !settled) terminate("INPUT");
    });
    const timeout = setTimeout(() => terminate("TIMEOUT"), this.timeoutMs);
    timeout.unref();

    const completion = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => {
        child.once("error", () => {
          forced ??= "SPAWN";
          resolve({ code: null, signal: null });
        });
        child.once("close", (code, signal) => resolve({ code, signal }));
      },
    );
    settled = true;
    clearTimeout(timeout);
    sourceStream.destroy();
    child.stdin.destroy();
    await inputDone;

    if (forced === "TIMEOUT") throw new ThumbnailDerivativeError("TIMEOUT");
    if (forced === "INPUT") throw new ThumbnailDerivativeError("INPUT_READ_FAILED");
    if (forced === "OUTPUT") throw new ThumbnailDerivativeError("OUTPUT_LIMIT_EXCEEDED");
    if (forced === "SPAWN" || forced === "DIAGNOSTIC") {
      throw new ThumbnailDerivativeError("SYSTEM_FAILURE");
    }
    if (completion.code !== 0 || completion.signal !== null) {
      throw new ThumbnailDerivativeError("PROCESS_FAILED");
    }
    return validateJpegThumbnail(
      Buffer.concat(stdout, stdoutBytes),
      this.maximumBytes,
      this.maximumDimension,
    );
  }
}
