import { ThumbnailDerivativeError, type ThumbnailDerivative } from "./media-derivative-generator";

const invalid = (): never => {
  throw new ThumbnailDerivativeError("OUTPUT_INVALID");
};

export function validateJpegThumbnail(
  input: Uint8Array,
  maximumBytes: number,
  maximumDimension: number,
): ThumbnailDerivative {
  if (input.byteLength === 0 || input.byteLength > maximumBytes) {
    throw new ThumbnailDerivativeError(
      input.byteLength > maximumBytes ? "OUTPUT_LIMIT_EXCEEDED" : "OUTPUT_INVALID",
    );
  }
  if (
    input.byteLength < 10 ||
    input[0] !== 0xff ||
    input[1] !== 0xd8 ||
    input[input.byteLength - 2] !== 0xff ||
    input[input.byteLength - 1] !== 0xd9
  ) {
    return invalid();
  }

  let offset = 2;
  let dimensions: { readonly width: number; readonly height: number } | undefined;
  let frameComponentIds: ReadonlySet<number> | undefined;
  let foundScan = false;
  while (offset < input.byteLength - 2) {
    if (input[offset] !== 0xff) return invalid();
    while (input[offset] === 0xff) offset += 1;
    const marker = input[offset];
    offset += 1;
    if (marker === undefined || marker === 0x00 || marker === 0xd8) return invalid();
    if (marker === 0xd9) break;
    if (marker === 0xda) {
      if (dimensions === undefined || offset + 3 > input.byteLength) return invalid();
      const scanLength = (input[offset] ?? 0) * 256 + (input[offset + 1] ?? 0);
      const scanComponents = input[offset + 2] ?? 0;
      if (
        frameComponentIds === undefined ||
        scanComponents < 1 ||
        scanComponents !== frameComponentIds.size ||
        scanLength !== 6 + 2 * scanComponents ||
        offset + scanLength >= input.byteLength - 2 ||
        input[offset + scanLength - 3] !== 0 ||
        input[offset + scanLength - 2] !== 0x3f ||
        input[offset + scanLength - 1] !== 0
      ) {
        return invalid();
      }
      const scanComponentIds = new Set<number>();
      for (let component = 0; component < scanComponents; component += 1) {
        const componentId = input[offset + 3 + component * 2];
        const tableSelectors = input[offset + 4 + component * 2];
        if (
          componentId === undefined ||
          !frameComponentIds.has(componentId) ||
          scanComponentIds.has(componentId) ||
          tableSelectors === undefined ||
          tableSelectors >> 4 > 3 ||
          (tableSelectors & 0x0f) > 3
        ) {
          return invalid();
        }
        scanComponentIds.add(componentId);
      }
      for (let scanOffset = offset + scanLength; scanOffset < input.byteLength - 2; scanOffset++) {
        if (input[scanOffset] !== 0xff) continue;
        const escaped = input[scanOffset + 1];
        if (escaped !== 0x00 && (escaped === undefined || escaped < 0xd0 || escaped > 0xd7)) {
          return invalid();
        }
        scanOffset += 1;
      }
      foundScan = true;
      break;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 2 > input.byteLength) return invalid();
    const segmentLength = (input[offset] ?? 0) * 256 + (input[offset + 1] ?? 0);
    if (segmentLength < 2 || offset + segmentLength > input.byteLength) return invalid();
    if (marker === 0xc0) {
      if (dimensions !== undefined || segmentLength < 11 || input[offset + 2] !== 8) {
        return invalid();
      }
      const height = (input[offset + 3] ?? 0) * 256 + (input[offset + 4] ?? 0);
      const width = (input[offset + 5] ?? 0) * 256 + (input[offset + 6] ?? 0);
      const components = input[offset + 7] ?? 0;
      if (width < 1 || height < 1 || width > maximumDimension || height > maximumDimension) {
        return invalid();
      }
      if ((components !== 1 && components !== 3) || segmentLength !== 8 + 3 * components) {
        return invalid();
      }
      const componentIds = new Set<number>();
      let samplingBlocks = 0;
      for (let component = 0; component < components; component += 1) {
        const componentId = input[offset + 8 + component * 3];
        const sampling = input[offset + 9 + component * 3];
        const quantizationTable = input[offset + 10 + component * 3];
        const horizontalSampling = sampling === undefined ? 0 : sampling >> 4;
        const verticalSampling = sampling === undefined ? 0 : sampling & 0x0f;
        if (
          componentId === undefined ||
          componentId === 0 ||
          componentIds.has(componentId) ||
          horizontalSampling < 1 ||
          horizontalSampling > 4 ||
          verticalSampling < 1 ||
          verticalSampling > 4 ||
          quantizationTable === undefined ||
          quantizationTable > 3
        ) {
          return invalid();
        }
        componentIds.add(componentId);
        samplingBlocks += horizontalSampling * verticalSampling;
      }
      if (samplingBlocks > 10) return invalid();
      dimensions = { width, height };
      frameComponentIds = componentIds;
    }
    offset += segmentLength;
  }
  if (dimensions === undefined || !foundScan) return invalid();
  return { bytes: Uint8Array.from(input), mimeType: "image/jpeg", ...dimensions };
}
