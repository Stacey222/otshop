import type { NextRequest } from "next/server";

import {
  InvalidMediaError,
  InvalidMediaFilenameError,
  MediaTooLargeError,
} from "@/application/media/media-errors";

export const encodedMediaFilename = (request: NextRequest): string => {
  const value = request.headers.get("x-media-filename");
  if (value === null || value.length === 0 || value.length > 800) {
    throw new InvalidMediaFilenameError();
  }
  try {
    return decodeURIComponent(value);
  } catch {
    throw new InvalidMediaFilenameError();
  }
};

export const declaredRequestLength = (
  request: NextRequest,
  maximum: number,
  required = false,
): number | null => {
  const value = request.headers.get("content-length");
  if (value === null) {
    if (required) throw new InvalidMediaError();
    return null;
  }
  if (!/^[0-9]+$/u.test(value)) throw new InvalidMediaError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) throw new MediaTooLargeError();
  return parsed;
};

export const validateIdentityEncoding = (request: NextRequest): void => {
  const contentEncoding = request.headers.get("content-encoding");
  if (contentEncoding !== null && contentEncoding.toLowerCase() !== "identity") {
    throw new InvalidMediaError();
  }
};

export const requestChunks = (body: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> => ({
  async *[Symbol.asyncIterator]() {
    const reader = body.getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) return;
        yield next.value;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  },
});
