import {
  InvalidMediaError,
  InvalidMediaFilenameError,
  UnsupportedMediaTypeError,
} from "./media-errors";

export const ACCEPTED_MEDIA_MIME_TYPE = "video/mp4";
export const MAX_DISPLAY_FILENAME_LENGTH = 200;
export const MEDIA_SIGNATURE_BYTES = 4_096;

const acceptedMp4Brands = new Set([
  "avc1",
  "dash",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "isom",
  "M4V ",
  "mp41",
  "mp42",
  "MSNV",
]);

const decodeAscii = (bytes: Uint8Array, offset: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4));

export function validateDeclaredMediaType(value: string): void {
  if (value.trim().toLowerCase() !== ACCEPTED_MEDIA_MIME_TYPE) {
    throw new UnsupportedMediaTypeError();
  }
}

export function sanitizeOriginalFilename(value: string): string {
  const filename = value.normalize("NFC").trim();
  if (
    filename.length === 0 ||
    [...filename].length > MAX_DISPLAY_FILENAME_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(filename) ||
    filename.includes("/") ||
    filename.includes("\\") ||
    /^[A-Za-z]:/u.test(filename) ||
    filename === "." ||
    filename === ".." ||
    !filename.toLowerCase().endsWith(".mp4")
  ) {
    throw new InvalidMediaFilenameError();
  }
  return filename;
}

export function validateMp4Signature(bytes: Uint8Array): void {
  if (bytes.length < 16 || decodeAscii(bytes, 4) !== "ftyp") throw new InvalidMediaError();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxSize = view.getUint32(0, false);
  if (boxSize < 16 || boxSize > bytes.length || boxSize % 4 !== 0) {
    throw new InvalidMediaError();
  }
  for (let offset = 8; offset + 4 <= boxSize; offset += 4) {
    if (offset === 12) continue;
    if (acceptedMp4Brands.has(decodeAscii(bytes, offset))) return;
  }
  throw new UnsupportedMediaTypeError();
}
