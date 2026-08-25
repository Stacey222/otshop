export type ThumbnailDerivativeFailureCode =
  | "INPUT_READ_FAILED"
  | "OUTPUT_INVALID"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "PROCESS_FAILED"
  | "SYSTEM_FAILURE"
  | "TIMEOUT";

export class ThumbnailDerivativeError extends Error {
  override readonly name = "ThumbnailDerivativeError";

  constructor(readonly code: ThumbnailDerivativeFailureCode) {
    super("Thumbnail generation failed");
  }
}

export interface ThumbnailDerivative {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly mimeType: "image/jpeg";
  readonly width: number;
}

export interface MediaDerivativeGenerator {
  generateThumbnail(input: {
    readonly durationMs: bigint;
    readonly source: AsyncIterable<Uint8Array>;
  }): Promise<ThumbnailDerivative>;
}
