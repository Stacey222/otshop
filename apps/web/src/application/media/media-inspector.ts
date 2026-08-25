import type { MediaInspectionFailureCode, MediaOrientation } from "@otshop/shared";

export type { MediaInspectionFailureCode, MediaInspectionStatus } from "@otshop/shared";

export interface NormalizedMediaMetadata {
  readonly durationMs: bigint;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly bitrateBps: bigint | null;
  readonly codec: "h264";
  readonly audioCodec: "aac" | null;
  readonly orientation: MediaOrientation;
}

export interface MediaInspector {
  inspect(source: AsyncIterable<Uint8Array>): Promise<NormalizedMediaMetadata>;
}

export class PermanentMediaInspectionError extends Error {
  override readonly name = "PermanentMediaInspectionError";

  constructor(readonly code: MediaInspectionFailureCode) {
    super("The stored media is not compatible");
  }
}

export class TransientMediaInspectionError extends Error {
  override readonly name = "TransientMediaInspectionError";

  constructor(readonly code: MediaInspectionFailureCode) {
    super("The media inspector is temporarily unavailable");
  }
}
