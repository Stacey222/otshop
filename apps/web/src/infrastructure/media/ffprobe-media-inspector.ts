import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { normalizeFFprobeOutput } from "@/application/media/ffprobe-output";
import {
  PermanentMediaInspectionError,
  TransientMediaInspectionError,
  type MediaInspector,
  type NormalizedMediaMetadata,
} from "@/application/media/media-inspector";

const FFPROBE_ARGUMENTS = [
  "-v",
  "error",
  "-show_entries",
  "format=format_name,duration,bit_rate:stream=index,codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,bit_rate,duration,disposition:stream_tags=rotate:stream_side_data=rotation",
  "-of",
  "json",
  "pipe:0",
] as const;

type SpawnProcess = (
  executable: string,
  arguments_: readonly string[],
) => ChildProcessWithoutNullStreams;

const defaultSpawn: SpawnProcess = (executable, arguments_) =>
  spawn(executable, arguments_, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

type ForcedOutcome = "INPUT" | "OUTPUT" | "SPAWN" | "TIMEOUT";

const isBrokenPipe = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  ["EPIPE", "ERR_STREAM_PREMATURE_CLOSE"].includes(String(Reflect.get(error, "code")));

export class FFprobeMediaInspector implements MediaInspector {
  constructor(
    private readonly executable: string,
    private readonly timeoutMs: number,
    private readonly maxOutputBytes: number,
    private readonly spawnProcess: SpawnProcess = defaultSpawn,
  ) {}

  async inspect(source: AsyncIterable<Uint8Array>): Promise<NormalizedMediaMetadata> {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.spawnProcess(this.executable, FFPROBE_ARGUMENTS);
    } catch {
      throw new TransientMediaInspectionError("SYSTEM_FAILURE");
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
      if (stdoutBytes > this.maxOutputBytes) {
        terminate("OUTPUT");
        return;
      }
      stdout.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > this.maxOutputBytes) terminate("OUTPUT");
    });

    const input = Readable.from(source);
    const inputDone = pipeline(input, child.stdin).catch((error: unknown) => {
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
    input.destroy();
    child.stdin.destroy();
    await inputDone;

    if (forced === "TIMEOUT") throw new TransientMediaInspectionError("TIMEOUT");
    if (forced === "SPAWN" || forced === "INPUT") {
      throw new TransientMediaInspectionError(
        forced === "INPUT" ? "STORAGE_READ_FAILED" : "SYSTEM_FAILURE",
      );
    }
    if (forced === "OUTPUT") throw new PermanentMediaInspectionError("OUTPUT_LIMIT_EXCEEDED");
    if (completion.code !== 0 || completion.signal !== null) {
      throw new PermanentMediaInspectionError("PROBE_INVALID_MEDIA");
    }
    return normalizeFFprobeOutput(Buffer.concat(stdout, stdoutBytes));
  }
}
